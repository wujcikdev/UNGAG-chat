import { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { useRecoilValue } from 'recoil';
import { easings } from '@react-spring/web';
import { HatGlasses, ShieldOff } from 'lucide-react';
import { EModelEndpoint } from 'librechat-data-provider';
import { BirthdayIcon, TooltipAnchor, SplitText } from '@librechat/client';
import { useChatContext, useAgentsMapContext, useAssistantsMapContext } from '~/Providers';
import Description, { isHtmlDescription } from '~/components/ui/Description';
import { useGetEndpointsQuery, useGetStartupConfig } from '~/data-provider';
import { getIconEndpoint, getEntity, getModelSpec } from '~/utils';
import { useLocalize, useAuthContext, useGreeting } from '~/hooks';
import AgentContact from '~/components/Agents/AgentContact';
import ConvoIcon from '~/components/Endpoints/ConvoIcon';
import temporaryStore from '~/store/temporary';

const containerClassName =
  'shadow-stroke relative flex h-full items-center justify-center rounded-full bg-presentation text-text-primary dark:after:shadow-none ';

/** Stable references: fresh literals re-initialized SplitText's springs and
 * re-rendered every grapheme span on each Landing render. */
const greetingAnimationFrom = { opacity: 0, transform: 'translate3d(0,50px,0)' };
const greetingAnimationTo = { opacity: 1, transform: 'translate3d(0,0,0)' };

function getTextSizeClass(text: string | undefined | null) {
  if (!text) {
    return 'text-xl sm:text-2xl';
  }

  if (text.length < 56) {
    return 'text-3xl sm:text-5xl lg:text-6xl';
  }

  if (text.length < 70) {
    return 'text-2xl sm:text-4xl';
  }

  return 'text-xl sm:text-2xl';
}

export default function Landing({ centerFormOnLanding }: { centerFormOnLanding: boolean }) {
  const { conversation } = useChatContext();
  const agentsMap = useAgentsMapContext();
  const assistantMap = useAssistantsMapContext();
  const { data: startupConfig } = useGetStartupConfig();
  const { data: endpointsConfig } = useGetEndpointsQuery();
  const { user } = useAuthContext();
  const localize = useLocalize();
  const isTemporary = useRecoilValue(temporaryStore.isTemporary);

  const [textHasMultipleLines, setTextHasMultipleLines] = useState(false);
  const [lineCount, setLineCount] = useState(1);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);

  const endpointType = useMemo(() => {
    let ep = conversation?.endpoint ?? '';
    if (ep === EModelEndpoint.azureOpenAI) {
      ep = EModelEndpoint.openAI;
    }
    return getIconEndpoint({
      endpointsConfig,
      iconURL: conversation?.iconURL,
      endpoint: ep,
    });
  }, [conversation?.endpoint, conversation?.iconURL, endpointsConfig]);

  const { entity, isAgent, isAssistant } = getEntity({
    endpoint: endpointType,
    agentsMap,
    assistantMap,
    agent_id: conversation?.agent_id,
    assistant_id: conversation?.assistant_id,
  });

  const modelSpec = useMemo(
    () => getModelSpec({ specName: conversation?.spec, startupConfig }),
    [conversation?.spec, startupConfig],
  );

  const brandedSpecLabel = modelSpec?.showOnLanding ? modelSpec.label : '';
  const brandedSpecDescription = (modelSpec?.showOnLanding && modelSpec.description) || '';
  const name = isTemporary ? '' : (entity?.name ?? brandedSpecLabel);
  const description = isTemporary
    ? localize('com_ui_temporary_description')
    : ((entity?.description || brandedSpecDescription || conversation?.greeting) ?? '');
  const descriptionIsHTML = isHtmlDescription(description);
  const selectedAgent =
    isAgent && conversation?.agent_id != null ? agentsMap?.[conversation.agent_id] : undefined;

  const customWelcome =
    typeof startupConfig?.interface?.customWelcome === 'string'
      ? startupConfig.interface.customWelcome
      : undefined;

  const scheduledGreeting = useGreeting(user?.name);

  const handleLineCountChange = useCallback((count: number) => {
    setTextHasMultipleLines(count > 1);
    setLineCount(count);
  }, []);

  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.offsetHeight);
    }
  }, [lineCount, description, selectedAgent]);

  const getDynamicMargin = useMemo(() => {
    let margin = 'mb-0';

    if (lineCount > 2 || (description && description.length > 100)) {
      margin = 'mb-10';
    } else if (lineCount > 1 || (description && description.length > 0)) {
      margin = 'mb-6';
    } else if (textHasMultipleLines) {
      margin = 'mb-4';
    }

    if (contentHeight > 200) {
      margin = 'mb-16';
    } else if (contentHeight > 150) {
      margin = 'mb-12';
    }

    return margin;
  }, [lineCount, description, textHasMultipleLines, contentHeight]);

  const resolvedWelcome =
    customWelcome != null && user?.name
      ? customWelcome.replace(/{{user.name}}/g, user.name)
      : customWelcome;

  const greetingText = isTemporary
    ? localize('com_ui_temporary')
    : (resolvedWelcome ?? scheduledGreeting);

  return (
    <div
      className={`flex h-full transform-gpu flex-col items-center justify-center pb-16 transition-all duration-200 ${centerFormOnLanding ? 'max-h-full sm:max-h-0' : 'max-h-full'} ${getDynamicMargin}`}
    >
      <div className="mb-7 flex items-center justify-center gap-2.5 sm:mb-9">
        <span className="bg-border-medium hidden h-px w-8 sm:block" aria-hidden="true" />
        <div className="border-accent-primary/30 bg-accent-primary/10 text-accent-primary inline-flex items-center gap-2 rounded-full border px-3.5 py-2">
          <ShieldOff className="size-3.5 shrink-0" aria-hidden="true" />
          <span className="font-mono text-xs font-semibold tracking-widest uppercase">
            {localize('com_ui_uncensored_ai')}
          </span>
          <span className="text-text-muted font-mono text-xs tracking-wide uppercase">
            {startupConfig?.appTitle ?? 'UNGAG Chat'}
          </span>
        </div>
        <span className="bg-border-medium hidden h-px w-8 sm:block" aria-hidden="true" />
      </div>
      <div ref={contentRef} className="flex flex-col items-center gap-0 p-2">
        <div
          className={`flex ${textHasMultipleLines ? 'flex-col' : 'flex-col md:flex-row'} items-center justify-center gap-4 md:gap-5`}
        >
          <div
            className={`relative size-12 justify-center sm:size-14 ${textHasMultipleLines ? 'mb-2' : ''}`}
          >
            <div className="border-border-medium bg-surface-secondary flex h-full w-full items-center justify-center rounded-2xl border">
              {isTemporary ? (
                <div className={containerClassName}>
                  <HatGlasses className="text-text-primary h-2/3 w-2/3" aria-hidden="true" />
                </div>
              ) : (
                <ConvoIcon
                  agentsMap={agentsMap}
                  assistantMap={assistantMap}
                  conversation={conversation}
                  endpointsConfig={endpointsConfig}
                  containerClassName={containerClassName}
                  context="landing"
                  className="text-text-primary h-2/3 w-2/3"
                  size={41}
                />
              )}
            </div>
            {startupConfig?.showBirthdayIcon && (
              <TooltipAnchor
                className="absolute right-2 bottom-[27px]"
                description={localize('com_ui_happy_birthday')}
                aria-label={localize('com_ui_happy_birthday')}
              >
                <BirthdayIcon />
              </TooltipAnchor>
            )}
          </div>
          {((isAgent || isAssistant) && name) || name ? (
            <div className="flex flex-col items-center gap-0 p-2">
              <SplitText
                key={`split-text-${name}`}
                text={name}
                className={`${getTextSizeClass(name)} text-text-primary font-medium`}
                delay={50}
                textAlign="center"
                animationFrom={greetingAnimationFrom}
                animationTo={greetingAnimationTo}
                easing={easings.easeOutCubic}
                threshold={0}
                rootMargin="0px"
                onLineCountChange={handleLineCountChange}
              />
            </div>
          ) : (
            <SplitText
              key={`split-text-${greetingText}${user?.name ? '-user' : ''}`}
              text={greetingText}
              className={`${getTextSizeClass(greetingText)} text-text-primary font-medium`}
              delay={50}
              textAlign="center"
              animationFrom={greetingAnimationFrom}
              animationTo={greetingAnimationTo}
              easing={easings.easeOutCubic}
              threshold={0}
              rootMargin="0px"
              onLineCountChange={handleLineCountChange}
            />
          )}
        </div>
        <Description
          allowMedia
          description={description}
          className={
            descriptionIsHTML
              ? 'animate-fadeIn text-text-primary mt-4 flex max-w-md items-center justify-center gap-2 text-center text-sm font-normal [&_img]:inline-block [&_img]:h-4 [&_img]:w-4'
              : `animate-fadeIn mt-4 max-w-md text-center text-sm font-normal ${isTemporary ? 'text-text-secondary' : 'text-text-primary'}`
          }
        />
        {selectedAgent && !isTemporary && (
          <AgentContact
            agent={selectedAgent}
            className="animate-fadeIn mt-2 max-w-md justify-center text-center text-sm"
          />
        )}
      </div>
    </div>
  );
}
