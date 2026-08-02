// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { showToast } from '../../src/toast.js';

beforeEach(() => {
  document.body.innerHTML = '<div id="toast-container"></div>';
});

afterEach(() => {
  vi.useRealTimers();
});

describe('showToast', () => {
  test('insère un toast avec le texte et le type demandés', () => {
    showToast('Ajouté dans Notion !', 'success');
    const toast = document.querySelector('#toast-container .toast');
    expect(toast).toBeTruthy();
    expect(toast.classList.contains('toast--success')).toBe(true);
    expect(toast.querySelector('.toast-text').textContent).toBe('Ajouté dans Notion !');
  });

  test("role='alert' + aria-live='assertive' pour une erreur, role='status' + 'polite' sinon", () => {
    showToast('Erreur réseau', 'error');
    const err = document.querySelector('#toast-container .toast--error');
    expect(err.getAttribute('role')).toBe('alert');
    expect(err.getAttribute('aria-live')).toBe('assertive');

    showToast('Info', 'info');
    const info = document.querySelector('#toast-container .toast--info');
    expect(info.getAttribute('role')).toBe('status');
    expect(info.getAttribute('aria-live')).toBe('polite');
  });

  test('le bouton de fermeture a un aria-label et retire le toast au clic', () => {
    showToast('Message', 'info');
    const closeBtn = document.querySelector('#toast-container .toast-close');
    expect(closeBtn.getAttribute('aria-label')).toBe('Fermer la notification');
    closeBtn.click();
    expect(document.querySelector('#toast-container .toast')).toBeNull();
  });

  test('Échap sur le toast le ferme', () => {
    showToast('Message', 'info');
    const toast = document.querySelector('#toast-container .toast');
    toast.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(document.querySelector('#toast-container .toast')).toBeNull();
  });

  test('succès/info disparaissent automatiquement après un délai, pas erreur/avertissement', () => {
    vi.useFakeTimers();
    showToast('Succès', 'success');
    showToast('Erreur', 'error');
    showToast('Avertissement', 'warning');
    expect(document.querySelectorAll('#toast-container .toast').length).toBe(3);
    vi.advanceTimersByTime(6000);
    expect(document.querySelectorAll('#toast-container .toast').length).toBe(2);
    expect(document.querySelector('.toast--error')).toBeTruthy();
    expect(document.querySelector('.toast--warning')).toBeTruthy();
  });

  test('sans #toast-container dans le DOM, ne lève pas et retourne null', () => {
    document.body.innerHTML = '';
    expect(showToast('Message', 'info')).toBeNull();
  });

  test('message vide → aucun toast créé', () => {
    expect(showToast('', 'info')).toBeNull();
    expect(document.querySelector('#toast-container .toast')).toBeNull();
  });

  test('plusieurs toasts s\'empilent (le plus récent en dernier enfant)', () => {
    showToast('Premier', 'info');
    showToast('Second', 'info');
    const texts = [...document.querySelectorAll('.toast-text')].map(t => t.textContent);
    expect(texts).toEqual(['Premier', 'Second']);
  });
});
