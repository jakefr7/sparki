import { OperationsCommandCenter } from '../../components/operations-command-center';

export default function TodaysSchedulePage() {
  return (
    <OperationsCommandCenter
      activeHref="/today"
      eyebrow="Today's Schedule"
      title="Today's Schedule"
    />
  );
}
