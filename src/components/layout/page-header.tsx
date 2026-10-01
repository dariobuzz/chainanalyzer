export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <div className="border-b bg-card">
      <div className="container flex flex-col gap-4 py-8 md:flex-row md:items-end md:justify-between">
        <div>
          {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-navy-900">{title}</h1>
          {description ? <p className="mt-1.5 max-w-2xl text-[0.875rem] text-muted-foreground">{description}</p> : null}
        </div>
        {actions}
      </div>
    </div>
  );
}
