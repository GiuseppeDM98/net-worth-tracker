'use client';

import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AssistantMemoryDocument, AssistantPreferences } from '@/types/assistant';
import { COSTUME_FRAME_RADIUS_CLASS } from '@/lib/constants/themeCostume';
import { cn } from '@/lib/utils';

interface AssistantPreferencesFieldsProps {
  memory: AssistantMemoryDocument | undefined;
  onChange: (patch: Partial<AssistantPreferences>) => void;
  isLoading: boolean;
  isPending: boolean;
  /** Demo mode disables every behaviour control. */
  disabled?: boolean;
}

const ROW_CLASS = cn('flex items-center justify-between gap-4 border border-border px-4 py-3', COSTUME_FRAME_RADIUS_CLASS);

function SwitchRow({ id, title, hint, checked, onCheckedChange, disabled }: {
  id: string; title: string; hint: string; checked: boolean; onCheckedChange: (checked: boolean) => void; disabled: boolean;
}) {
  return (
    <div className={ROW_CLASS}>
      <Label htmlFor={id} className="flex flex-col items-start gap-0.5">
        <span className="text-[14px] font-medium text-foreground">{title}</span>
        <span className="text-[13px] font-normal text-muted-foreground">{hint}</span>
      </Label>
      <Switch id={id} aria-label={title} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </div>
  );
}

/**
 * Single home for "how the assistant behaves": response style, web/macro context, automatic
 * learning (memory on/off), and the test-only dummy-snapshot toggle. The body of the «Preferenze»
 * modal the header's «⋯» opens (2026-11-12; a header popover until then): a Select and Switches
 * never sit inside a menu. Every change saves at once — the modal has no footer.
 */
export function AssistantPreferencesFields({ memory, onChange, isLoading, isPending, disabled }: AssistantPreferencesFieldsProps) {
  const controlsDisabled = Boolean(isLoading || isPending || disabled);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="assistant-response-style" className="text-[13px] font-medium text-muted-foreground">
          Stile di risposta
        </Label>
        <Select
          value={memory?.preferences.responseStyle ?? 'balanced'}
          onValueChange={(value) => onChange({ responseStyle: value as AssistantPreferences['responseStyle'] })}
          disabled={controlsDisabled}
        >
          <SelectTrigger id="assistant-response-style" className="w-full" aria-label="Stile di risposta">
            <SelectValue placeholder="Stile di risposta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="balanced">Bilanciato</SelectItem>
            <SelectItem value="concise">Conciso</SelectItem>
            <SelectItem value="deep">Approfondito</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <SwitchRow
        id="assistant-macro-context"
        title="Contesto macro"
        hint="Cerca sul web in ogni analisi di periodo."
        checked={memory?.preferences.includeMacroContext ?? false}
        onCheckedChange={(checked) => onChange({ includeMacroContext: checked })}
        disabled={controlsDisabled}
      />

      <SwitchRow
        id="assistant-memory-enabled"
        title="Apprendimento automatico"
        hint="Salva in memoria i fatti stabili che dichiari."
        checked={memory?.preferences.memoryEnabled ?? true}
        onCheckedChange={(checked) => onChange({ memoryEnabled: checked })}
        disabled={controlsDisabled}
      />

      {/* Test accounts only — hidden unless the user has dummy snapshots. */}
      {memory?.hasDummySnapshots && (
        <SwitchRow
          id="assistant-dummy-snapshots"
          title="Snapshot di test"
          hint="Includi snapshot dummy nelle analisi (solo account di test)."
          checked={memory?.preferences.includeDummySnapshots ?? false}
          onCheckedChange={(checked) => onChange({ includeDummySnapshots: checked })}
          disabled={controlsDisabled}
        />
      )}
    </div>
  );
}
