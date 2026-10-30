import type { ReactNode } from 'react';

import { AVATARS, UserAvatar } from '@/components/user-avatar';
import { LanguageSwitch } from '@/components/layout/language-switch';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useFormat } from '@/i18n/format';

// Dev-only design preview (not in production builds, so its text is not translated). Edit
// src/styles/theme.css and watch this page; flip light/dark with the OS setting or DevTools →
// Rendering → "Emulate CSS prefers-color-scheme".

const SWATCHES = [
  { name: 'background', className: 'bg-background text-foreground border' },
  { name: 'card', className: 'bg-card text-card-foreground border' },
  { name: 'primary', className: 'bg-primary text-primary-foreground' },
  { name: 'secondary', className: 'bg-secondary text-secondary-foreground' },
  { name: 'accent', className: 'bg-accent text-accent-foreground' },
  { name: 'muted', className: 'bg-muted text-muted-foreground' },
  { name: 'destructive', className: 'bg-destructive text-destructive-foreground' },
  { name: 'border / input / ring', className: 'border-4 border-ring bg-input text-foreground' },
  { name: 'heat-1', className: 'bg-heat-1 text-foreground' },
  { name: 'heat-2', className: 'bg-heat-2 text-foreground' },
  { name: 'heat-3', className: 'bg-heat-3 text-foreground' },
  { name: 'heat-4', className: 'bg-heat-4 text-background' },
] as const;

const BUTTON_VARIANTS = [
  'default',
  'secondary',
  'outline',
  'ghost',
  'link',
  'destructive',
] as const;
const BUTTON_SIZES = ['xs', 'sm', 'default', 'lg'] as const;

export function UiPreviewPage() {
  const format = useFormat();
  return (
    <main className="mx-auto flex max-w-content flex-col gap-10 px-4 py-8">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">UI preview</h1>
        <LanguageSwitch />
      </header>

      <Section title="Colours">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {SWATCHES.map((swatch) => (
            <div
              key={swatch.name}
              className={`flex h-20 items-end rounded-lg p-2 text-xs font-medium ${swatch.className}`}
            >
              {swatch.name}
            </div>
          ))}
        </div>
      </Section>

      <Section title="Typography">
        <p className="text-4xl font-bold tracking-tight">Toasthub 4xl</p>
        <p className="text-2xl font-bold tracking-tight">Page title 2xl</p>
        <p>Body text: the quick brown toast jumps over the lazy butter.</p>
        <p className="text-sm text-muted-foreground">Muted small text for hints and metadata.</p>
      </Section>

      <Section title="Buttons">
        {BUTTON_SIZES.map((size) => (
          <div key={size} className="flex flex-wrap items-center gap-2">
            {BUTTON_VARIANTS.map((variant) => (
              <Button key={variant} variant={variant} size={size}>
                {variant}
              </Button>
            ))}
          </div>
        ))}
        <div>
          <Button disabled>disabled</Button>
        </div>
      </Section>

      <Section title="Form controls">
        <div className="flex flex-col gap-2">
          <Label htmlFor="preview-input">Label</Label>
          <Input id="preview-input" placeholder="Placeholder" />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="preview-invalid">Invalid</Label>
          <Input id="preview-invalid" defaultValue="x" aria-invalid />
        </div>
        <RadioGroup defaultValue="a" aria-label="Radio group">
          {['a', 'b'].map((value) => (
            <div key={value} className="flex items-center gap-3">
              <RadioGroupItem id={`preview-radio-${value}`} value={value} />
              <Label htmlFor={`preview-radio-${value}`}>Option {value.toUpperCase()}</Label>
            </div>
          ))}
        </RadioGroup>
      </Section>

      <Section title="Card">
        <Card>
          <CardHeader>
            <CardTitle>Today</CardTitle>
            <CardDescription>3 toasts · 🔥 12-day streak</CardDescription>
          </CardHeader>
          <CardContent>
            <p>Card content sits on the card surface.</p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Avatars">
        <div className="flex flex-wrap items-center gap-3">
          {AVATARS.map(({ id }) => (
            <UserAvatar key={id} name="Toast Tester" avatarId={id} />
          ))}
          <UserAvatar name="No Choice" avatarId={null} />
          <UserAvatar name={null} />
        </div>
        <div className="flex items-center gap-3">
          <UserAvatar name="Šimon Ďurček" avatarId={3} size="sm" />
          <UserAvatar name="Šimon Ďurček" avatarId={3} size="md" />
          <UserAvatar name="Šimon Ďurček" avatarId={3} size="lg" />
        </div>
      </Section>

      <Section title="Formatting (follows the language)">
        <ul className="text-sm">
          <li>Number: {format.number(1234567.89)}</li>
          <li>Date and time: {format.dateTime('2026-10-29T17:45:00Z')}</li>
          <li>Local date: {format.localDate('2026-10-29')}</li>
        </ul>
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {children}
    </section>
  );
}
