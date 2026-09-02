export const SUPPORT_PROMPT_EVENT = 'inmotools:support-prompt';
export const SUPPORT_URL = 'https://buymeacoffee.com/aahplexx';

export interface SupportPromptDetail {
  readonly key?: string;
  readonly message: string;
}

export const requestSupportPrompt = (detail: SupportPromptDetail) => {
  const message = detail.message.trim();
  if (!message || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<SupportPromptDetail>(SUPPORT_PROMPT_EVENT, {
    detail: { key: detail.key, message },
  }));
};
