import {
  setDebug,
  themeParams,
  initData,
  viewport,
  init as initSDK,
  mockTelegramEnv,
  retrieveLaunchParams,
  emitEvent,
  miniApp,
  backButton,
  type Events,
} from '@tma.js/sdk-react';

type ThemeParamsEvent = Events['theme_changed']['theme_params'];

export async function init(options: {
  debug: boolean;
  eruda: boolean;
  mockForMacOS: boolean;
}): Promise<void> {
  setDebug(options.debug);

  try {
    initSDK();
  } catch (e) {
    console.error('Erro em initSDK()', e);
  }

  // Desligue eruda em tablet antigo
  if (options.eruda) {
    try {
      const mod = await import('eruda');
      const eruda = mod.default;
      eruda.init();
      eruda.position({ x: window.innerWidth - 50, y: 0 });
    } catch (e) {
      console.error('Erro ao iniciar eruda', e);
    }
  }

  if (options.mockForMacOS) {
    try {
      let firstThemeSent = false;

      mockTelegramEnv({
        onEvent(event, next) {
          if (event.name === 'web_app_request_theme') {
            let tp: ThemeParamsEvent = {};

            if (firstThemeSent) {
              tp = themeParams.state() as ThemeParamsEvent;
            } else {
              firstThemeSent = true;

              const fromLaunch = retrieveLaunchParams().tgWebAppThemeParams;
              if (fromLaunch) tp = fromLaunch as ThemeParamsEvent;
            }

            return emitEvent('theme_changed', { theme_params: tp });
          }

          if (event.name === 'web_app_request_safe_area') {
            return emitEvent('safe_area_changed', {
              left: 0,
              top: 0,
              right: 0,
              bottom: 0,
            });
          }

          next();
        },
      });
    } catch (e) {
      console.error('Erro no mockTelegramEnv()', e);
    }
  }

  try {
    backButton.mount.ifAvailable();
  } catch (e) {
    console.error('Erro em backButton.mount.ifAvailable()', e);
  }

  try {
    initData.restore();
  } catch (e) {
    console.error('Erro em initData.restore()', e);
  }

  try {
    if (miniApp.mount.isAvailable()) {
      try {
        themeParams.mount();
      } catch (e) {
        console.error('Erro em themeParams.mount()', e);
      }

      try {
        miniApp.mount();
      } catch (e) {
        console.error('Erro em miniApp.mount()', e);
      }

      try {
        themeParams.bindCssVars();
      } catch (e) {
        console.error('Erro em themeParams.bindCssVars()', e);
      }
    }
  } catch (e) {
    console.error('Erro no bloco miniApp.mount', e);
  }

  try {
    if (viewport.mount.isAvailable()) {
      try {
        await viewport.mount();
      } catch (e) {
        console.error('Erro em await viewport.mount()', e);
      }

      try {
        viewport.bindCssVars();
      } catch (e) {
        console.error('Erro em viewport.bindCssVars()', e);
      }
    }
  } catch (e) {
    console.error('Erro no bloco viewport.mount', e);
  }
}