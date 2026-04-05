import { AssistantPageClient } from '@/components/assistant/AssistantPageClient';

export default function AssistantPage() {
  return <AssistantPageClient assistantConfigured={Boolean(process.env.ANTHROPIC_API_KEY)} />;
}
