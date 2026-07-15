import { TERMS_AND_CONDITIONS } from '@loan-pilot/domain';

/**
 * Render one T&C paragraph with light structure so the dense legal text is
 * scannable: numbered sub-clauses (9.1, 9.1.1…) hang-indent by depth, "Step N"
 * headings are emphasised, and all-caps instruction lines read as subheadings.
 */
const Clause = ({ text }: { text: string }) => {
  const numbered = /^(\d+(?:\.\d+)*\.)\s+([\s\S]*)$/.exec(text);
  if (numbered) {
    const depth = numbered[1]?.match(/\./g)?.length ?? 1;
    const indent = depth >= 3 ? 'pl-8' : depth === 2 ? 'pl-4' : '';
    return (
      <p className={`flex gap-2 leading-relaxed text-muted-foreground ${indent}`}>
        <span className="shrink-0 font-medium text-foreground/70">{numbered[1]}</span>
        <span>{numbered[2]}</span>
      </p>
    );
  }

  const step = /^(Step\s+[IVX]+)\s*[:.]?\s*([\s\S]*)$/.exec(text);
  if (step) {
    return (
      <p className="leading-relaxed text-muted-foreground">
        <span className="font-semibold text-foreground">{step[1]}. </span>
        {step[2]}
      </p>
    );
  }

  if (text === text.toUpperCase() && /[A-Z]/.test(text) && text.length < 90) {
    return (
      <p className="pt-1 text-xs font-semibold uppercase tracking-wide text-foreground">{text}</p>
    );
  }

  return <p className="leading-relaxed text-muted-foreground">{text}</p>;
};

/** The full NAMFISA Terms & Conditions, formatted for on-screen reading. */
export const TermsContent = () => (
  <div className="space-y-5 text-sm">
    <p className="italic text-muted-foreground">{TERMS_AND_CONDITIONS.preamble}</p>
    {TERMS_AND_CONDITIONS.sections.map((section) => (
      <section
        key={section.title}
        className="space-y-2 border-t border-border/60 pt-4 first:border-t-0 first:pt-0"
      >
        <h3 className="font-semibold text-foreground">{section.title}</h3>
        {section.body.map((paragraph, index) => (
          <Clause key={index} text={paragraph} />
        ))}
      </section>
    ))}
  </div>
);
