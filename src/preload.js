const { ipcRenderer, webFrame } = require('electron');

// Wrap the page's Notification class so clicking a notification brings the window to the front.
// This runs in the page's own world, so it can only talk back through postMessage.
webFrame.executeJavaScript(`
  (() => {
    const Native = window.Notification;
    if (!Native || Native.__waWrapped) return;
    class WrappedNotification extends Native {
      constructor(title, options) {
        super(title, options);
        this.addEventListener('click', () => window.postMessage({ __waNotificationClick: true }, '*'));
      }
    }
    WrappedNotification.__waWrapped = true;
    window.Notification = WrappedNotification;
  })();
`);

window.addEventListener('message', (event) => {
  if (event.source === window && event.data && event.data.__waNotificationClick) {
    ipcRenderer.send('notification-clicked');
  }
});
