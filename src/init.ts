import {
  setDebug,
  initData,
  init as initSDK,
  mockTelegramEnv,
  retrieveLaunchParams,
  emitEvent,
  miniApp,
  backButton,
  type Events,
} from '@tma.js/sdk-react';

type ThemeParamsEvent = Events['theme_changed']['theme_params'];

function isOldAndroid() {
  try {
    var ua = navigator.userAgent || '';
    return /Android 5/i.test(ua);
  } catch (e) {
    return false;
  }
}

export async function init(options: {
  debug: boolean;
  eruda: boolean;
  mockForMacOS: boolean;
}): Promise<void> {
  setDebug(options.debug);

  try {
    initSDK();
    console.log('initSDK ok');
  } catch (e) {
    console.error('Erro em initSDK()', e);
  }

  // desligado por padrão em aparelho antigo
  if (options.eruda && !isOldAndroid()) {
    try {
      const mod = await import('eruda');
      const eruda = mod.default;
      eruda.init();
      eruda.position({ x: window.innerWidth - 50, y: 0 });
      console.log('eruda ok');
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
              try {
                const launch = retrieveLaunchParams();
                tp = (launch.tgWebAppThemeParams || {}) as ThemeParamsEvent;
              } catch (e) {
                tp = {};
              }
            } else {
              firstThemeSent = true;

              try {
                const fromLaunch = retrieveLaunchParams().tgWebAppThemeParams;
                if (fromLaunch) tp = fromLaunch as ThemeParamsEvent;
              } catch (e) {
                tp = {};
              }
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

      console.log('mockTelegramEnv ok');
    } catch (e) {
      console.error('Erro no mockTelegramEnv()', e);
    }
  }

  try {
    if (backButton.mount && backButton.mount.ifAvailable) {
      backButton.mount.ifAvailable();
      console.log('backButton ok');
    }
  } catch (e) {
    console.error('Erro em backButton.mount.ifAvailable()', e);
  }

  try {
    initData.restore();
    console.log('initData.restore ok');
  } catch (e) {
    console.error('Erro em initData.restore()', e);
  }

  try {
    if (miniApp.mount && miniApp.mount.isAvailable && miniApp.mount.isAvailable()) {
      try {
        miniApp.mount();
        console.log('miniApp.mount ok');
      } catch (e) {
        console.error('Erro em miniApp.mount()', e);
      }
    }
  } catch (e) {
    console.error('Erro no bloco miniApp.mount', e);
  }
}