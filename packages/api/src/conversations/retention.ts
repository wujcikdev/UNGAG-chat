import { isAllDataRetention, isForcedTemporaryRetention } from 'librechat-data-provider';
import type { ConversationMethods, MessageMethods } from '@librechat/data-schemas';
import type { ConversationWriteContext } from './save';

export type ForcedRetentionStore = Pick<MessageMethods, 'saveMessage'> &
  Pick<ConversationMethods, 'saveConvo'>;

export interface ForcedRetentionWrite {
  ctx: ConversationWriteContext;
  conversationId: string;
  /** Re-stamps this message as well; omit when the caller already saved it through `saveMessage`. */
  messageId?: string;
  /** Logged by the underlying writes to name the caller. */
  context: string;
}

/**
 * Restores forced-temporary retention after a write that bypasses it.
 *
 * `updateMessage` and the artifact and branch routes touch rows without going through the
 * retention-aware save path, so under `retentionMode: "ephemeral"` an edit inside a chat that
 * predates the setting would leave the message expiring while the conversation holding it stayed
 * permanent and visible. Neither write upserts: a row deleted while the edit was in flight stays
 * deleted instead of coming back as a skeleton carrying only its identity and retention fields.
 */
export async function applyForcedRetention(
  { saveMessage, saveConvo }: ForcedRetentionStore,
  { ctx, conversationId, messageId, context }: ForcedRetentionWrite,
): Promise<void> {
  if (!isForcedTemporaryRetention(ctx.interfaceConfig?.retentionMode)) {
    return;
  }

  if (messageId != null) {
    await saveMessage(
      ctx,
      { messageId, conversationId, user: ctx.userId },
      {
        context,
        noUpsert: true,
      },
    );
  }

  await saveConvo(ctx, { conversationId }, { context, noUpsert: true });
}

export interface ImportRetentionFields {
  isTemporary?: boolean;
  expiredAt?: Date;
}

export interface ImportRetentionDependencies {
  createChatExpirationDate: (
    interfaceConfig?: ConversationWriteContext['interfaceConfig'],
    isTemporary?: boolean,
  ) => Date;
  createFallbackRetentionDate: () => Date;
  logger?: { error: (message: string, error?: unknown) => void };
}

/**
 * The retention fields an imported, forked or duplicated record is stored with.
 *
 * Empty unless the mode expires all data. Under `ephemeral` the records are additionally
 * marked temporary, which is what keeps an imported chat out of history and out of the
 * bookmark counts; a deadline that cannot be computed falls back rather than storing a
 * record with no expiration at all.
 *
 * A fork or duplicate passes `sourceIsTemporary` so a copy of a chat the user marked
 * temporary keeps that classification under `all` instead of being published into history
 * with the longer general deadline. A fresh import has no source and stays visible.
 */
export function resolveImportRetentionFields(
  interfaceConfig: ConversationWriteContext['interfaceConfig'],
  { createChatExpirationDate, createFallbackRetentionDate, logger }: ImportRetentionDependencies,
  { sourceIsTemporary }: { sourceIsTemporary?: boolean } = {},
): ImportRetentionFields {
  if (!isAllDataRetention(interfaceConfig?.retentionMode)) {
    return {};
  }

  const isTemporary =
    isForcedTemporaryRetention(interfaceConfig?.retentionMode) || sourceIsTemporary === true;
  try {
    return { isTemporary, expiredAt: createChatExpirationDate(interfaceConfig, isTemporary) };
  } catch (error) {
    logger?.error('[resolveImportRetentionFields] Error creating import expiration date:', error);
    return { isTemporary, expiredAt: createFallbackRetentionDate() };
  }
}

/**
 * The bookmark tags an import should count.
 *
 * Forced-temporary records are excluded from every bookmark-filtered conversation query and
 * are removed by TTL without a matching decrement, so counting their tags would leave
 * permanent phantom totals behind chats a user can never reach.
 */
export function resolveImportTagCounts(
  retention: ImportRetentionFields,
  tags: readonly string[],
): string[] {
  return retention.isTemporary === true ? [] : [...tags];
}
