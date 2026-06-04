'use client';

import { Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { AssistantMemoryDocument, AssistantPreferences } from '@/types/assistant';

interface AssistantPreferencesPopoverProps {
  memory: AssistantMemoryDocument | undefined;
  onChange: (patch: Partial<AssistantPreferences>) => void;
  isLoading: boolean;
  isPending: boolean;
  /** Demo mode disables every behaviour control. */
  disabled?: boolean;
}

/**
 * Single home for "how the assistant behaves": response style, web/macro context,
 * automatic learning (memory on/off), and the test-only dummy-snapshot toggle.
 *
 * Previously these were scattered across a header gear popover, the memory panel,
 * and the composer. Consolidating them removes the "which control lives where?"
 * recall cost and gives behaviour one consistent mental model.
 */
export function AssistantPreferencesPopover({
  memory,
  onChange,
  isLoading,
  isPending,
  disabled,
}: AssistantPreferencesPopoverProps) {
  const controlsDisabled = isLoading || isPending || disabled;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          title={disabled ? 'Non disponibile in modalità demo' : undefined}
          className="h-8 w-8"
          aria-label="Preferenze assistente"
        >
          <Settings2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72">
        <p className="mb-3 text-sm font-semibold text-foreground">Preferenze</p>

        {/* Response style */}
        <div className="mb-3 space-y-1.5">
          <label className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
            Stile di risposta
          </label>
          <Select
            value={memory?.preferences.responseStyle ?? 'balanced'}
            onValueChange={(value) =>
              onChange({ responseStyle: value as AssistantPreferences['responseStyle'] })
            }
            disabled={controlsDisabled}
          >
            <SelectTrigger>
              <SelectValue placeholder="Stile di risposta" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="balanced">Bilanciato</SelectItem>
              <SelectItem value="concise">Conciso</SelectItem>
              <SelectItem value="deep">Approfondito</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Behaviour toggles */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Contesto macro</p>
              <p className="text-xs text-muted-foreground">Abilita ricerca web nelle analisi e in chat.</p>
            </div>
            <Switch
              checked={memory?.preferences.includeMacroContext ?? false}
              onCheckedChange={(checked) => onChange({ includeMacroContext: checked })}
              disabled={controlsDisabled}
            />
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
            <div>
              <p className="text-sm font-medium text-foreground">Apprendimento automatico</p>
              <p className="text-xs text-muted-foreground">
                Salva in memoria i fatti stabili che dichiari.
              </p>
            </div>
            <Switch
              checked={memory?.preferences.memoryEnabled ?? true}
              onCheckedChange={(checked) => onChange({ memoryEnabled: checked })}
              disabled={controlsDisabled}
            />
          </div>

          {/* Test accounts only — hidden unless the user has dummy snapshots. */}
          {memory?.hasDummySnapshots && (
            <div className="flex items-center justify-between gap-4 rounded-lg border border-border px-3 py-2">
              <div>
                <p className="text-sm font-medium text-foreground">Snapshot di test</p>
                <p className="text-xs text-muted-foreground">
                  Includi snapshot dummy nelle analisi (solo account di test).
                </p>
              </div>
              <Switch
                checked={memory?.preferences.includeDummySnapshots ?? false}
                onCheckedChange={(checked) => onChange({ includeDummySnapshots: checked })}
                disabled={controlsDisabled}
              />
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
