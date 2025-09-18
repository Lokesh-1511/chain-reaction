/**
 * Offline Detection and Network Status Utilities
 */

export class OfflineDetector {
  constructor() {
    this.isOnline = navigator.onLine;
    this.listeners = [];
    this.init();
  }

  init() {
    // Listen for online/offline events
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyListeners('online');
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyListeners('offline');
    });

    // Also check connectivity by trying to fetch a small resource
    this.startConnectivityCheck();
  }

  /**
   * Add a listener for network status changes
   */
  addListener(callback) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(listener => listener !== callback);
    };
  }

  /**
   * Notify all listeners of status change
   */
  notifyListeners(status) {
    this.listeners.forEach(callback => {
      try {
        callback(status, this.isOnline);
      } catch (error) {
        console.error('Error in offline detector listener:', error);
      }
    });
  }

  /**
   * Periodically check connectivity by attempting a fetch
   */
  startConnectivityCheck() {
    setInterval(async () => {
      const wasOnline = this.isOnline;
      this.isOnline = await this.checkConnectivity();
      
      if (wasOnline !== this.isOnline) {
        this.notifyListeners(this.isOnline ? 'online' : 'offline');
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Check actual connectivity by attempting to fetch a resource
   */
  async checkConnectivity() {
    if (!navigator.onLine) {
      return false;
    }

    try {
      const response = await fetch('/manifest.json', {
        method: 'HEAD',
        cache: 'no-cache',
        signal: AbortSignal.timeout(5000) // 5 second timeout
      });
      return response.ok;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get current online status
   */
  getStatus() {
    return {
      isOnline: this.isOnline,
      browserOnline: navigator.onLine
    };
  }
}

// Create singleton instance
export const offlineDetector = new OfflineDetector();

/**
 * Show offline notification
 */
export const showOfflineNotification = () => {
  // Create and show a notification that the app is offline
  const notification = document.createElement('div');
  notification.id = 'offline-notification';
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #ff6b6b;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    ">
      📱 You're offline - Playing in local mode
    </div>
  `;
  
  // Remove any existing notification
  const existing = document.getElementById('offline-notification');
  if (existing) {
    existing.remove();
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
};

/**
 * Show online notification
 */
export const showOnlineNotification = () => {
  const notification = document.createElement('div');
  notification.id = 'online-notification';
  notification.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      background: #4CAF50;
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      z-index: 10000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    ">
      🌐 You're back online
    </div>
  `;
  
  // Remove any existing notification
  const existing = document.getElementById('online-notification');
  if (existing) {
    existing.remove();
  }
  
  document.body.appendChild(notification);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.remove();
    }
  }, 3000);
};