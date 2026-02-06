import { StoredConversation } from "../types";

export class ConversationStore {
  static STORAGE_KEY = 'pflege-chat-conversation';

  /**
   * Generate a new session ID for server-side draft tracking
   */
  static generateSessionId(): string {
    return crypto.randomUUID();
  }

  static save(data: StoredConversation): void {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(this.STORAGE_KEY, serialized);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'QuotaExceededError') {
        console.warn('LocalStorage quota exceeded. Conversation not saved.');
      } else {
        console.error('Failed to save conversation:', error);
      }
    }
  }

  static load(): StoredConversation | null {
    try {
      const serialized = localStorage.getItem(this.STORAGE_KEY);
      if (!serialized) {
        return null;
      }

      const parsed = JSON.parse(serialized);

      // Validate required fields
      if (!parsed.messages || !parsed.formState || typeof parsed.progress !== 'number') {
        console.warn('Invalid stored conversation format');
        return null;
      }

      // Parse timestamps back into Date objects
      const messages = parsed.messages.map((msg: any) => ({
        ...msg,
        timestamp: new Date(msg.timestamp)
      }));

      // Ensure sessionId exists (migrate old conversations)
      const sessionId = parsed.sessionId || this.generateSessionId();

      return {
        messages,
        formState: parsed.formState,
        progress: parsed.progress,
        updatedAt: parsed.updatedAt,
        sessionId
      };
    } catch (error) {
      console.error('Failed to load conversation:', error);
      return null;
    }
  }

  static clear(): void {
    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear conversation:', error);
    }
  }

  static exists(): boolean {
    try {
      return localStorage.getItem(this.STORAGE_KEY) !== null;
    } catch (error) {
      console.error('Failed to check conversation existence:', error);
      return false;
    }
  }
}
