/**
 * Addon Detector: Giám sát trạng thái giao diện AI Studio (Spec 008, FR-006, FR-008, FR-009, US2).
 * Nhận diện giới hạn tài nguyên (Rate Limit), trang đăng xuất Google, và banner lỗi hệ thống.
 */

/**
 * Phát hiện trạng thái giao diện từ DOM document của tab AI Studio.
 *
 * @param {object} domDocument Đối tượng DOM document của trang tab
 * @param {object} [selectors] Bộ chọn DOM (từ selectors.json hoặc cấu hình ghi đè)
 * @returns {{
 *   isRateLimited: boolean,
 *   isLoggedOut: boolean,
 *   isErrorBanner: boolean,
 *   errorMessage?: string
 * }}
 */
export function detectUiState(domDocument, selectors = {}) {
  const result = {
    isRateLimited: false,
    isLoggedOut: false,
    isErrorBanner: false,
    errorMessage: undefined
  };

  if (!domDocument) {
    return result;
  }

  // 1. Nhận diện chuyển hướng đăng nhập Google qua URL / location (FR-009: tuyệt đối KHÔNG tự ý đăng nhập)
  try {
    const currentUrl = domDocument.location?.href || domDocument.URL || domDocument.defaultView?.location?.href;
    if (typeof currentUrl === 'string' && currentUrl.includes('accounts.google.com')) {
      result.isLoggedOut = true;
    }
  } catch {
    // An toàn bỏ qua lỗi truy cập location
  }

  // 2. Nhận diện phần tử biểu thị trạng thái đăng xuất trong DOM
  const selLogin = selectors?.loginIndicator || 'form[action*="accounts.google.com"], a[href*="accounts.google.com"]';
  if (!result.isLoggedOut && typeof domDocument.querySelector === 'function') {
    try {
      const loginEl = domDocument.querySelector(selLogin);
      if (loginEl) {
        result.isLoggedOut = true;
      }
    } catch {
      // Bỏ qua lỗi cú pháp selector nếu có
    }
  }

  // 3. Nhận diện banner Quota exceeded / Resource exhausted (FR-008: đánh dấu rate limit để fallback)
  const selRateLimit = selectors?.rateLimitBanner || 'div:has-text("Quota exceeded"), div:has-text("Resource exhausted")';
  if (typeof domDocument.querySelector === 'function') {
    try {
      const rateLimitEl = domDocument.querySelector(selRateLimit);
      if (rateLimitEl) {
        result.isRateLimited = true;
        const text = rateLimitEl.textContent || rateLimitEl.innerText || '';
        if (text) {
          result.errorMessage = text.trim();
        }
      }
    } catch {
      // Bỏ qua lỗi querySelector trên các selector tuỳ biến không chuẩn native
    }
  }

  // Fallback kiểm tra văn bản trong DOM nếu selector tuỳ biến không tìm thấy
  if (!result.isRateLimited && typeof domDocument.querySelector === 'function') {
    try {
      const bodyText = domDocument.body?.innerText || domDocument.body?.textContent || '';
      if (/quota exceeded|resource exhausted/i.test(bodyText)) {
        result.isRateLimited = true;
        result.errorMessage = result.errorMessage || (bodyText.includes('Quota exceeded') ? 'Quota exceeded' : 'Resource exhausted');
      }
    } catch {
      // An toàn bỏ qua lỗi đọc văn bản body
    }
  }

  // 4. Nhận diện banner lỗi giao diện chung
  const selError = selectors?.errorBanner || '.error-banner, div[role="alert"], ms-banner[type="error"]';
  if (!result.isRateLimited && !result.isLoggedOut && typeof domDocument.querySelector === 'function') {
    try {
      const errorEl = domDocument.querySelector(selError);
      if (errorEl) {
        const text = (errorEl.textContent || errorEl.innerText || '').trim();
        if (text) {
          if (/quota exceeded|resource exhausted/i.test(text)) {
            result.isRateLimited = true;
          } else {
            result.isErrorBanner = true;
          }
          result.errorMessage = text;
        }
      }
    } catch {
      // An toàn bỏ qua lỗi đọc banner lỗi
    }
  }

  return result;
}
