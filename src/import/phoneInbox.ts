import * as AppIntents from "expo-app-intents";

// The bank messages the "Add bank SMS" Shortcuts action (app-intents/AddBankSmsIntent.swift) has queued on this phone, which
// import/smsCapture.ts turns into transactions. The queue is the app's own storage: the text never leaves the phone. Delivery from the
// queue can repeat, which is safe: a payment is saved once per UPI number.
const INTENT_NAME = "addBankSms";

export interface QueuedSms {
  id: string; // the queue's id for it, needed to remove it
  text: string;
  at: string; // ISO time the action ran
}

// Everything queued, oldest first. Empty where App Intents do not exist: Expo Go, the browser and Android (where the messages will be read
// on the phone itself, not through Shortcuts; not built yet).
export async function readPhoneInbox(): Promise<QueuedSms[]> {
  if (!AppIntents.isAvailable()) return [];
  const pending = await AppIntents.getPendingInvocationsAsync();
  return pending
    .filter((invocation) => invocation.name === INTENT_NAME)
    .map((invocation) => ({
      id: invocation.id,
      text: typeof invocation.params.text === "string" ? invocation.params.text : "",
      at: new Date(invocation.createdAt).toISOString(),
    }));
}

// Takes a message off the queue once its payment is saved (or it is dismissed).
export async function removePhoneMessage(id: string): Promise<void> {
  if (AppIntents.isAvailable()) await AppIntents.removePendingInvocationAsync(id);
}

// Calls `onMessage` when the action runs while the app is open. Returns the function that stops listening.
export function listenForPhoneMessages(onMessage: () => void): () => void {
  if (!AppIntents.isAvailable()) return () => {};
  const subscription = AppIntents.addAppIntentListener((invocation) => {
    if (invocation.name === INTENT_NAME) onMessage();
  });
  return () => subscription.remove();
}

// Whether this build has the action at all (an old build, Expo Go, Android and the browser do not).
export const phoneInboxAvailable = (): boolean => AppIntents.isAvailable();
