"use client";

// Aca resuelvo el popup de configuracion visual con persistencia en localStorage.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import {
  APP_DENSITY_OPTIONS,
  APP_SETTINGS_DEFAULTS,
  APP_SETTINGS_STORAGE_KEY,
  APP_THEME_OPTIONS,
  applyAppSettings,
  normalizeAppSettings
} from "@/lib/app-settings";

// Aca leo lo ultimo guardado para abrir el popup ya sincronizado con la UI.
function readStoredSettings() {
  try {
    const raw = window.localStorage.getItem(APP_SETTINGS_STORAGE_KEY);

    return normalizeAppSettings(raw ? JSON.parse(raw) : APP_SETTINGS_DEFAULTS);
  } catch {
    return APP_SETTINGS_DEFAULTS;
  }
}

// Este popup maneja tema y densidad sin sacar al usuario del flujo principal.
export function SettingsPopup() {
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [settings, setSettings] = useState(APP_SETTINGS_DEFAULTS);

  useEffect(() => {
    setIsMounted(true);
    setSettings(readStoredSettings());
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  // Aca aplico y persisto el cambio en un solo lugar para no desordenar el estado.
function persistSettings(nextSettings) {
    const normalizedSettings = applyAppSettings(document.documentElement, nextSettings);

    setSettings(normalizedSettings);

    try {
      window.localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(normalizedSettings));
    } catch {
      // Si localStorage falla, mantenemos el cambio al menos en esta sesion.
    }
  }

  function updateSetting(key, value) {
    persistSettings({
      ...settings,
      [key]: value
    });
  }

  function resetSettings() {
    persistSettings(APP_SETTINGS_DEFAULTS);
  }

  // El modal sale por portal para quedar por encima de toda la interfaz.
const modal = isOpen ? (
    <div className="sheet-backdrop" onClick={() => setIsOpen(false)}>
      <section
        className="sheet sheet--settings"
        aria-modal="true"
        role="dialog"
        aria-labelledby="settings-popup-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sheet__header">
          <div>
            <p className="sheet__eyebrow">Configuracion</p>
            <h2 id="settings-popup-title">Ajustes visuales</h2>
          </div>
          <button type="button" className="sheet__close" onClick={() => setIsOpen(false)}>
            Cerrar
          </button>
        </div>

        <div className="sheet-form">
          <section className="settings-card">
            <div className="settings-card__header">
              <div>
                <h3>Tema</h3>
              </div>
            </div>

            <div className="segmented-control" role="group" aria-label="Tema">
              {APP_THEME_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`segmented-control__button segmented-control__button--simple ${
                    settings.theme === option.value ? "is-active" : ""
                  }`}
                  onClick={() => updateSetting("theme", option.value)}
                  aria-pressed={settings.theme === option.value}
                >
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-card">
            <div className="settings-card__header">
              <div>
                <h3>Densidad</h3>
              </div>
            </div>

            <div className="segmented-control segmented-control--dual" role="group" aria-label="Densidad">
              {APP_DENSITY_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={`segmented-control__button segmented-control__button--simple ${
                    settings.density === option.value ? "is-active" : ""
                  }`}
                  onClick={() => updateSetting("density", option.value)}
                  aria-pressed={settings.density === option.value}
                >
                  <strong>{option.label}</strong>
                </button>
              ))}
            </div>
          </section>

          <div className="sheet__actions">
            <button type="button" className="secondary-button" onClick={resetSettings}>
              Restablecer
            </button>
          </div>
        </div>
      </section>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        className="secondary-button icon-button"
        aria-label="Configuracion"
        title="Configuracion"
        onClick={() => setIsOpen(true)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.757.426 1.757 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.757-2.924 1.757-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.757-.426-1.757-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 15.75A3.75 3.75 0 1012 8.25a3.75 3.75 0 000 7.5z" />
        </svg>
      </button>

      {isMounted && modal ? createPortal(modal, document.body) : null}
    </>
  );
}