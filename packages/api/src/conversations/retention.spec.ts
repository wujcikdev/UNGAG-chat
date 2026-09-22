import { RetentionMode } from 'librechat-data-provider';
import type { ForcedRetentionStore } from './retention';
import {
  applyForcedRetention,
  resolveImportRetentionFields,
  resolveImportTagCounts,
} from './retention';

describe('applyForcedRetention', () => {
  const conversationId = 'conversation-1';
  const messageId = 'message-1';
  const context = 'PUT /api/messages/:conversationId/:messageId';
  let store: { saveMessage: jest.Mock; saveConvo: jest.Mock };

  const ctxFor = (retentionMode?: RetentionMode) => ({
    userId: 'user-1',
    interfaceConfig: retentionMode == null ? undefined : { retentionMode },
  });

  beforeEach(() => {
    store = { saveMessage: jest.fn(), saveConvo: jest.fn() };
  });

  const run = (ctx: ReturnType<typeof ctxFor>, messageIdArg?: string) =>
    applyForcedRetention(store as unknown as ForcedRetentionStore, {
      ctx,
      conversationId,
      ...(messageIdArg == null ? {} : { messageId: messageIdArg }),
      context,
    });

  it('re-stamps the message and its conversation under ephemeral retention', async () => {
    await run(ctxFor(RetentionMode.EPHEMERAL), messageId);

    expect(store.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      { messageId, conversationId, user: 'user-1' },
      { context, noUpsert: true },
    );
    expect(store.saveConvo).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      { conversationId },
      { context, noUpsert: true },
    );
  });

  it('never upserts a row that no longer exists', async () => {
    await run(ctxFor(RetentionMode.EPHEMERAL), messageId);

    expect(store.saveMessage).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ noUpsert: true }),
    );
    expect(store.saveConvo).toHaveBeenCalledWith(
      expect.anything(),
      { conversationId },
      {
        context,
        noUpsert: true,
      },
    );
  });

  it('leaves a caller-saved message alone when no message id is given', async () => {
    await run(ctxFor(RetentionMode.EPHEMERAL));

    expect(store.saveMessage).not.toHaveBeenCalled();
    expect(store.saveConvo).toHaveBeenCalledTimes(1);
  });

  it.each([RetentionMode.TEMPORARY, RetentionMode.ALL, undefined])(
    'writes nothing under retentionMode %s',
    async (retentionMode) => {
      await run(ctxFor(retentionMode), messageId);

      expect(store.saveMessage).not.toHaveBeenCalled();
      expect(store.saveConvo).not.toHaveBeenCalled();
    },
  );

  it('carries the retention context the caller resolved', async () => {
    const expiredAt = new Date('2030-01-01T00:00:00.000Z');
    const ctx = {
      userId: 'user-1',
      isTemporary: true,
      expiredAt,
      interfaceConfig: { retentionMode: RetentionMode.EPHEMERAL, temporaryChatRetention: 1 },
    };

    await applyForcedRetention(store as unknown as ForcedRetentionStore, {
      ctx,
      conversationId,
      messageId,
      context,
    });

    expect(store.saveMessage).toHaveBeenCalledWith(ctx, expect.anything(), {
      context,
      noUpsert: true,
    });
    expect(store.saveConvo).toHaveBeenCalledWith(ctx, { conversationId }, expect.anything());
  });
});

describe('resolveImportRetentionFields', () => {
  const deps = {
    createChatExpirationDate: jest.fn(() => new Date('2030-01-01T00:00:00.000Z')),
    createFallbackRetentionDate: jest.fn(() => new Date('2031-01-01T00:00:00.000Z')),
    logger: { error: jest.fn() },
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([RetentionMode.TEMPORARY, undefined])('stores nothing under retentionMode %s', (mode) => {
    expect(
      resolveImportRetentionFields(mode == null ? undefined : { retentionMode: mode }, deps),
    ).toEqual({});
    expect(deps.createChatExpirationDate).not.toHaveBeenCalled();
  });

  it('gives an all-data import a deadline without marking it temporary', () => {
    const fields = resolveImportRetentionFields({ retentionMode: RetentionMode.ALL }, deps);

    expect(fields).toEqual({ isTemporary: false, expiredAt: new Date('2030-01-01T00:00:00.000Z') });
    expect(deps.createChatExpirationDate).toHaveBeenCalledWith(
      { retentionMode: RetentionMode.ALL },
      false,
    );
  });

  it('marks an ephemeral import temporary with the temporary-chat deadline', () => {
    const interfaceConfig = { retentionMode: RetentionMode.EPHEMERAL, temporaryChatRetention: 1 };
    const fields = resolveImportRetentionFields(interfaceConfig, deps);

    expect(fields).toEqual({ isTemporary: true, expiredAt: new Date('2030-01-01T00:00:00.000Z') });
    expect(deps.createChatExpirationDate).toHaveBeenCalledWith(interfaceConfig, true);
  });

  it('keeps a copy of a temporary chat temporary under all-data retention', () => {
    const interfaceConfig = { retentionMode: RetentionMode.ALL, generalChatRetention: 2160 };
    const fields = resolveImportRetentionFields(interfaceConfig, deps, { sourceIsTemporary: true });

    expect(fields.isTemporary).toBe(true);
    expect(deps.createChatExpirationDate).toHaveBeenCalledWith(interfaceConfig, true);
  });

  it('leaves a copy of an ordinary chat visible under all-data retention', () => {
    const interfaceConfig = { retentionMode: RetentionMode.ALL, generalChatRetention: 2160 };
    const fields = resolveImportRetentionFields(interfaceConfig, deps, {
      sourceIsTemporary: false,
    });

    expect(fields.isTemporary).toBe(false);
    expect(deps.createChatExpirationDate).toHaveBeenCalledWith(interfaceConfig, false);
  });

  it('forces a copy temporary under ephemeral whatever its source was', () => {
    const fields = resolveImportRetentionFields({ retentionMode: RetentionMode.EPHEMERAL }, deps, {
      sourceIsTemporary: false,
    });

    expect(fields.isTemporary).toBe(true);
  });

  it('falls back rather than storing an import with no deadline', () => {
    deps.createChatExpirationDate.mockImplementationOnce(() => {
      throw new Error('bad retention window');
    });

    expect(resolveImportRetentionFields({ retentionMode: RetentionMode.EPHEMERAL }, deps)).toEqual({
      isTemporary: true,
      expiredAt: new Date('2031-01-01T00:00:00.000Z'),
    });
    expect(deps.logger.error).toHaveBeenCalled();
  });
});

describe('resolveImportTagCounts', () => {
  it('counts the tags of an import that stays visible', () => {
    expect(resolveImportTagCounts({ isTemporary: false }, ['work', 'urgent'])).toEqual([
      'work',
      'urgent',
    ]);
    expect(resolveImportTagCounts({}, ['work'])).toEqual(['work']);
  });

  it('counts nothing for a forced-temporary import', () => {
    expect(resolveImportTagCounts({ isTemporary: true }, ['work', 'urgent'])).toEqual([]);
  });
});
