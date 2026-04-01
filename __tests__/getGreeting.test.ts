import { describe, it, expect } from 'vitest';
import { getGreeting } from '@/lib/utils/getGreeting';

describe('getGreeting', () => {
  describe('mattina (5–11)', () => {
    it('restituisce Buongiorno alle 5 (boundary di inizio)', () => {
      const r = getGreeting(5);
      expect(r.greeting).toBe('Buongiorno');
      expect(r.subtitle).toBe('Ecco il tuo patrimonio di stamattina');
    });

    it('restituisce Buongiorno alle 11 (boundary di fine)', () => {
      expect(getGreeting(11).greeting).toBe('Buongiorno');
    });

    it('restituisce Buongiorno alle 8', () => {
      expect(getGreeting(8).greeting).toBe('Buongiorno');
    });
  });

  describe('pomeriggio (12–17)', () => {
    it('restituisce Buon pomeriggio alle 12 (boundary di inizio)', () => {
      const r = getGreeting(12);
      expect(r.greeting).toBe('Buon pomeriggio');
      expect(r.subtitle).toBe('Aggiornamento pomeridiano');
    });

    it('restituisce Buon pomeriggio alle 17 (boundary di fine)', () => {
      expect(getGreeting(17).greeting).toBe('Buon pomeriggio');
    });

    it('restituisce Buon pomeriggio alle 14', () => {
      expect(getGreeting(14).greeting).toBe('Buon pomeriggio');
    });
  });

  describe('sera (18–21)', () => {
    it('restituisce Buonasera alle 18 (boundary di inizio)', () => {
      const r = getGreeting(18);
      expect(r.greeting).toBe('Buonasera');
      expect(r.subtitle).toBe('Riepilogo della giornata');
    });

    it('restituisce Buonasera alle 21 (boundary di fine)', () => {
      expect(getGreeting(21).greeting).toBe('Buonasera');
    });

    it('restituisce Buonasera alle 20', () => {
      expect(getGreeting(20).greeting).toBe('Buonasera');
    });
  });

  describe('notte (22–4)', () => {
    it('restituisce Buonanotte alle 22 (boundary di inizio)', () => {
      const r = getGreeting(22);
      expect(r.greeting).toBe('Buonanotte');
      expect(r.subtitle).toBe('Sei sveglio tardi — ecco il tuo portafoglio');
    });

    it('restituisce Buonanotte a mezzanotte (0)', () => {
      expect(getGreeting(0).greeting).toBe('Buonanotte');
    });

    it('restituisce Buonanotte alle 4 (boundary di fine)', () => {
      expect(getGreeting(4).greeting).toBe('Buonanotte');
    });

    it('restituisce Buonanotte alle 3', () => {
      expect(getGreeting(3).greeting).toBe('Buonanotte');
    });
  });

  describe('boundary tra fasce', () => {
    it('12 è pomeriggio, non mattina', () => {
      expect(getGreeting(12).greeting).not.toBe('Buongiorno');
    });

    it('18 è sera, non pomeriggio', () => {
      expect(getGreeting(18).greeting).not.toBe('Buon pomeriggio');
    });

    it('22 è notte, non sera', () => {
      expect(getGreeting(22).greeting).not.toBe('Buonasera');
    });

    it('5 è mattina, non notte', () => {
      expect(getGreeting(5).greeting).not.toBe('Buonanotte');
    });
  });
});
