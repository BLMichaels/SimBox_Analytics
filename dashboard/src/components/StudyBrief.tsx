type Props = {
  text: string;
};

export function StudyBrief({ text }: Props) {
  return (
    <section className="study-brief mb-6 border-l-4 border-teal bg-card px-5 py-4">
      <p className="text-[11px] font-medium tracking-[0.18em] text-teal uppercase">Study brief</p>
      <p className="font-serif mt-2 text-lg leading-7 text-ink">{text}</p>
    </section>
  );
}
