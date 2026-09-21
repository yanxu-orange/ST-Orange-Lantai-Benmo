import { bootstrap, installGenerateInterceptor } from './src/app/bootstrap.js';

// The manifest resolves this function by its global name. Install it before
// any optional UI work so a settings rendering failure cannot leave a stale
// interceptor reference.
installGenerateInterceptor(globalThis);

try {
    bootstrap();
} catch (error) {
    console.error('[兰台] 扩展启动失败。', error);
}

