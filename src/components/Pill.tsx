interface PillProps {
  label: string;
  selected: boolean;
  onClick: () => void;
  title?: string;
}

export default function Pill({ label, selected, onClick, title }: PillProps) {
  return (
    <button
      type="button"
      className={`pill ${selected ? 'selected' : ''}`}
      onClick={onClick}
      title={title}
    >
      {label}
    </button>
  );
}
