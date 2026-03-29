// Aca centralizo los ajustes visuales que la app guarda del lado del navegador.

export const APP_SETTINGS_STORAGE_KEY = "turneria.app-settings";

export const APP_SETTINGS_DEFAULTS = Object.freeze({
  theme: "warm",
  density: "comfortable"
});

export const APP_THEME_OPTIONS = [
  {
    value: "warm",
    label: "Arena",
    description: "La paleta original, calida y con mas contraste visual."
  },
  {
    value: "light",
    label: "Claro",
    description: "Mas limpio y frio para jornadas largas sin tanto amarillo."
  },
  {
    value: "dark",
    label: "Oscuro",
    description: "Menos brillo y mejor lectura si trabajas de noche."
  }
];

export const APP_DENSITY_OPTIONS = [
  {
    value: "comfortable",
    label: "Comoda",
    description: "Mas aire entre bloques y targets grandes."
  },
  {
    value: "compact",
    label: "Compacta",
    description: "Menos padding y mas informacion visible por pantalla."
  }
];

const VALID_VALUES = {
  theme: APP_THEME_OPTIONS.map((option) => option.value),
  density: APP_DENSITY_OPTIONS.map((option) => option.value)
};

function pickAllowedValue(value, allowedValues, fallbackValue) {
  return allowedValues.includes(value) ? value : fallbackValue;
}

// Aca limpio cualquier valor raro antes de aplicarlo a la UI.
export function normalizeAppSettings(input = {}) {
  const source = input && typeof input === "object" ? input : {};

  return {
    theme: pickAllowedValue(source.theme, VALID_VALUES.theme, APP_SETTINGS_DEFAULTS.theme),
    density: pickAllowedValue(source.density, VALID_VALUES.density, APP_SETTINGS_DEFAULTS.density)
  };
}

// Con esto bajo los ajustes al DOM via data-attributes para que CSS haga el resto.
export function applyAppSettings(root, input) {
  const settings = normalizeAppSettings(input);

  if (root?.dataset) {
    root.dataset.theme = settings.theme;
    root.dataset.density = settings.density;
    delete root.dataset.motion;
  }

  return settings;
}

// Este script corre antes de hidratar para evitar parpadeos de tema o densidad.
export function getAppSettingsInitScript() {
  return `(() => {
    const storageKey = ${JSON.stringify(APP_SETTINGS_STORAGE_KEY)};
    const defaults = ${JSON.stringify(APP_SETTINGS_DEFAULTS)};
    const validValues = ${JSON.stringify(VALID_VALUES)};
    const normalize = (input) => {
      const source = input && typeof input === "object" ? input : {};

      return {
        theme: validValues.theme.includes(source.theme) ? source.theme : defaults.theme,
        density: validValues.density.includes(source.density) ? source.density : defaults.density
      };
    };
    const apply = (settings) => {
      const root = document.documentElement;
      root.dataset.theme = settings.theme;
      root.dataset.density = settings.density;
      delete root.dataset.motion;
    };

    try {
      const raw = window.localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : defaults;
      apply(normalize(parsed));
    } catch (error) {
      apply(defaults);
    }
  })();`;
}