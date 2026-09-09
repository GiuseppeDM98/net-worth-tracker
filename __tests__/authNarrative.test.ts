import { describe, it, expect } from 'vitest';
import { narrativeToText } from '@/lib/utils/narrative';
import {
  MIN_PASSWORD_LENGTH,
  arePasswordRequirementsMet,
  buildLoginVerdict,
  buildRegisterVerdict,
  describeAuthError,
  describeLoginStatus,
  describeRegisterStatus,
  describeUnmetRequirements,
  evaluatePasswordRequirements,
  resolveRegistrationAccess,
} from '@/lib/utils/authNarrative';

describe('resolveRegistrationAccess', () => {
  it('is open when registrations are on and no whitelist governs', () => {
    expect(resolveRegistrationAccess(true, false)).toBe('open');
  });

  it('is closed when registrations are off and no whitelist governs', () => {
    expect(resolveRegistrationAccess(false, false)).toBe('closed');
  });

  it('is invite-only whenever the whitelist governs', () => {
    expect(resolveRegistrationAccess(true, true)).toBe('invite-only');
  });

  // Mirrors isRegistrationAllowed(): with the whitelist on, a listed email registers
  // even while registrations are globally disabled. The page must not promise a closed
  // door the server leaves ajar.
  it('is invite-only when the whitelist governs even with registrations disabled', () => {
    expect(resolveRegistrationAccess(false, true)).toBe('invite-only');
  });
});

describe('buildLoginVerdict', () => {
  it('opens with the product promise, in a neutral tone', () => {
    const verdict = buildLoginVerdict();
    expect(verdict.headline).toBe('Il tuo patrimonio, spiegato prima che misurato.');
    expect(verdict.tone).toBe('neutral');
  });

  it('names what the account holds and the reading order', () => {
    const sentence = narrativeToText(buildLoginVerdict().sentence);
    expect(sentence).toContain('Patrimonio, cashflow, dividendi e piano FIRE');
    expect(sentence).toContain('i numeri vengono dopo');
  });
});

describe('buildRegisterVerdict', () => {
  it('asks for the two fields that are required, when registration is open', () => {
    const verdict = buildRegisterVerdict('open');
    expect(verdict.headline).toBe('Bastano un’email e una password.');
    expect(verdict.tone).toBe('neutral');
    expect(narrativeToText(verdict.sentence)).toContain('Il nome è facoltativo');
  });

  it('drops the whitelist clause when no whitelist governs', () => {
    expect(narrativeToText(buildRegisterVerdict('open').sentence)).not.toContain('autorizzate');
  });

  it('declares the whitelist, and that nothing is created before the check', () => {
    const sentence = narrativeToText(buildRegisterVerdict('invite-only').sentence);
    expect(sentence).toContain('riservata alle email autorizzate');
    expect(sentence).toContain('prima di creare');
  });

  it('states the closed door and points at the login', () => {
    const verdict = buildRegisterVerdict('closed');
    expect(verdict.headline).toBe('Le registrazioni sono chiuse.');
    expect(narrativeToText(verdict.sentence)).toContain('puoi accedere');
  });
});

describe('describeLoginStatus', () => {
  it('says what the form wants while it is idle', () => {
    const reading = describeLoginStatus({ phase: 'idle' });
    expect(reading.tone).toBe('neutral');
    expect(narrativeToText(reading.narrative)).toBe(
      'Accedi con l’email e la password del tuo profilo.',
    );
  });

  it('says what it is doing while it submits', () => {
    expect(narrativeToText(describeLoginStatus({ phase: 'submitting' }).narrative)).toBe(
      'Sto verificando le credenziali.',
    );
  });

  it('says where it is going on success', () => {
    expect(narrativeToText(describeLoginStatus({ phase: 'success' }).narrative)).toBe(
      'Accesso riuscito: apro la Panoramica.',
    );
  });

  it('carries the failure in words, in the negative tone', () => {
    const reading = describeLoginStatus({ phase: 'error', message: 'Email o password non corretti.' });
    expect(reading.tone).toBe('negative');
    expect(narrativeToText(reading.narrative)).toBe('Email o password non corretti.');
  });

  // Narrative Honesty: an error phase with nothing to say falls back to a sentence that
  // claims nothing about the cause, never to an empty line or a placeholder.
  it('falls back to a cause-free sentence when the failure has no words', () => {
    const reading = describeLoginStatus({ phase: 'error' });
    expect(reading.tone).toBe('negative');
    expect(narrativeToText(reading.narrative)).toBe(
      'Non è stato possibile completare l’accesso. Riprova.',
    );
  });
});

describe('describeRegisterStatus', () => {
  it('names the two things the form needs when registration is open', () => {
    expect(narrativeToText(describeRegisterStatus({ phase: 'idle' }, 'open').narrative)).toBe(
      'Serve un’email e una password di almeno 6 caratteri.',
    );
  });

  it('names the authorisation too when the whitelist governs', () => {
    expect(narrativeToText(describeRegisterStatus({ phase: 'idle' }, 'invite-only').narrative)).toBe(
      'Serve un’email autorizzata e una password di almeno 6 caratteri.',
    );
  });

  it('explains the closed door instead of the form', () => {
    const reading = describeRegisterStatus({ phase: 'idle' }, 'closed');
    expect(reading.tone).toBe('neutral');
    expect(narrativeToText(reading.narrative)).toContain('non si creano nuovi profili');
  });

  it('says what it is doing while it submits', () => {
    expect(narrativeToText(describeRegisterStatus({ phase: 'submitting' }, 'open').narrative)).toBe(
      'Sto creando il tuo profilo.',
    );
  });

  it('carries the failure in words, in the negative tone', () => {
    const reading = describeRegisterStatus(
      { phase: 'error', message: 'Questa email non è abilitata alla registrazione.' },
      'invite-only',
    );
    expect(reading.tone).toBe('negative');
    expect(narrativeToText(reading.narrative)).toBe(
      'Questa email non è abilitata alla registrazione.',
    );
  });
});

describe('describeAuthError', () => {
  it.each([
    ['auth/invalid-credential', 'Email o password non corretti.'],
    ['auth/wrong-password', 'Email o password non corretti.'],
    ['auth/user-not-found', 'Email o password non corretti.'],
  ])('reads %s as a single, non-enumerating sentence', (code, expected) => {
    expect(describeAuthError({ code })).toBe(expected);
  });

  it('names an invalid address', () => {
    expect(describeAuthError({ code: 'auth/invalid-email' })).toBe(
      'L’indirizzo email non è valido.',
    );
  });

  it('names the rate limit and what to do about it', () => {
    expect(describeAuthError({ code: 'auth/too-many-requests' })).toContain('Troppi tentativi');
  });

  it('names a network failure', () => {
    expect(describeAuthError({ code: 'auth/network-request-failed' })).toContain('connessione');
  });

  it('sends an existing account to the login', () => {
    expect(describeAuthError({ code: 'auth/email-already-in-use' })).toContain(
      'Esiste già un profilo',
    );
  });

  it('states the password floor', () => {
    expect(describeAuthError({ code: 'auth/weak-password' })).toContain('6 caratteri');
  });

  it('says a blocked registration created nothing', () => {
    expect(describeAuthError({ code: 'registration/not-allowed' })).toBe(
      'Questa email non è abilitata alla registrazione. Non è stato creato nessun profilo.',
    );
  });

  it('says a closed Google popup for what it is', () => {
    expect(describeAuthError({ code: 'auth/popup-closed-by-user' })).toContain('Google');
  });

  // The raw Firebase string is English, carries a code in parentheses and leaks the
  // provider's vocabulary: an unknown code takes a sentence that claims nothing.
  it('never lets a raw Firebase message reach the screen', () => {
    const message = describeAuthError({
      code: 'auth/internal-error',
      message: 'Firebase: Error (auth/internal-error).',
    });
    expect(message).not.toContain('Firebase');
    expect(message).not.toContain('auth/');
    expect(message).toBe('Non è stato possibile completare l’operazione. Riprova.');
  });

  it.each([[undefined], [null], ['boom'], [{}], [new Error('boom')]])(
    'falls back on an input carrying no code (%s)',
    (input) => {
      expect(describeAuthError(input)).toBe(
        'Non è stato possibile completare l’operazione. Riprova.',
      );
    },
  );
});

describe('evaluatePasswordRequirements', () => {
  it('exposes the floor it checks against', () => {
    expect(MIN_PASSWORD_LENGTH).toBe(6);
  });

  it('lists exactly the two rules the form enforces', () => {
    expect(evaluatePasswordRequirements('', '').map((r) => r.label)).toEqual([
      'Almeno 6 caratteri',
      'Le due password coincidono',
    ]);
  });

  it('meets neither rule on an empty form', () => {
    expect(evaluatePasswordRequirements('', '').map((r) => r.met)).toEqual([false, false]);
  });

  // Two empty fields are equal, but nothing has been typed: a requirement that ticks
  // itself before the user acts is a claim the data does not support.
  it('does not tick the match rule on two empty fields', () => {
    const requirements = evaluatePasswordRequirements('', '');
    expect(requirements.find((r) => r.id === 'match')?.met).toBe(false);
  });

  it('ticks the match rule on two equal short passwords, and not the length one', () => {
    expect(evaluatePasswordRequirements('abc', 'abc').map((r) => r.met)).toEqual([false, true]);
  });

  it('ticks the length rule alone when the confirmation diverges', () => {
    expect(evaluatePasswordRequirements('abcdef', 'abcde').map((r) => r.met)).toEqual([true, false]);
  });

  it('ticks both on a valid pair', () => {
    expect(evaluatePasswordRequirements('abcdef', 'abcdef').map((r) => r.met)).toEqual([true, true]);
  });

  it('counts the boundary length as met', () => {
    expect(evaluatePasswordRequirements('123456', '123456')[0].met).toBe(true);
    expect(evaluatePasswordRequirements('12345', '12345')[0].met).toBe(false);
  });
});

describe('arePasswordRequirementsMet', () => {
  it('is true only when every rule is met', () => {
    expect(arePasswordRequirementsMet(evaluatePasswordRequirements('abcdef', 'abcdef'))).toBe(true);
    expect(arePasswordRequirementsMet(evaluatePasswordRequirements('abcdef', 'abcde'))).toBe(false);
    expect(arePasswordRequirementsMet(evaluatePasswordRequirements('', ''))).toBe(false);
  });
});

describe('describeUnmetRequirements', () => {
  it('says nothing when the form is valid', () => {
    expect(describeUnmetRequirements(evaluatePasswordRequirements('abcdef', 'abcdef'))).toBeNull();
  });

  it('names the length rule alone', () => {
    expect(describeUnmetRequirements(evaluatePasswordRequirements('abc', 'abc'))).toBe(
      'La password deve avere almeno 6 caratteri.',
    );
  });

  it('names the match rule alone', () => {
    expect(describeUnmetRequirements(evaluatePasswordRequirements('abcdef', 'abcde'))).toBe(
      'Le due password non coincidono.',
    );
  });

  it('joins the two rules in one sentence', () => {
    expect(describeUnmetRequirements(evaluatePasswordRequirements('abc', 'xy'))).toBe(
      'La password deve avere almeno 6 caratteri e le due password non coincidono.',
    );
  });
});
