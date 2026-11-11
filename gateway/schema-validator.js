/**
 * Gateway Schema Validator: Kiểm định khuôn dữ liệu JSON từ AI Studio (Spec 008, FR-008, US2).
 * Phân tích an toàn chuỗi kết quả (kể cả khối markdown) và thẩm định các trường bắt buộc / kiểu dữ liệu.
 */

/**
 * Phân tích chuỗi JSON an toàn từ nhiều định dạng phản hồi (văn bản thô, markdown codeblock, JSON lồng).
 *
 * @param {string} text
 * @returns {object} Dữ liệu đã parse
 */
function safeParseJson(text) {
  const trimmed = text.trim();

  // 1. Thử parse trực tiếp
  try {
    return JSON.parse(trimmed);
  } catch {
    // Tiếp tục các phương thức bóc tách
  }

  // 2. Trích xuất từ markdown code block: ```json ... ``` hoặc ``` ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Tiếp tục bóc tách cặp ngoặc nhọn
    }
  }

  // 3. Trích xuất từ cặp ngoặc nhọn ngoài cùng { ... }
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    const candidate = trimmed.slice(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(candidate);
    } catch {
      // Parse thất bại
    }
  }

  throw new Error('Cannot parse JSON from result text');
}

/**
 * Kiểm tra kiểu dữ liệu của giá trị so với kiểu khai báo trong schema.
 *
 * @param {*} value
 * @param {string} expectedType
 * @returns {boolean}
 */
function matchType(value, expectedType) {
  switch (expectedType) {
    case 'string':
      return typeof value === 'string';
    case 'number':
      return typeof value === 'number' && !Number.isNaN(value);
    case 'boolean':
      return typeof value === 'boolean';
    case 'array':
      return Array.isArray(value);
    case 'object':
      return typeof value === 'object' && value !== null && !Array.isArray(value);
    default:
      return true;
  }
}

/**
 * Thẩm định kết quả chuỗi JSON theo cấu trúc schema yêu cầu.
 *
 * @param {string} resultText Chuỗi kết quả từ tab AI Studio hoặc clipboard
 * @param {object} [schemaObject] Định nghĩa schema chứa required fields và properties types
 * @returns {{
 *   valid: boolean,
 *   parsedJson?: object,
 *   error?: string
 * }}
 */
export function validateResultSchema(resultText, schemaObject) {
  if (typeof resultText !== 'string' || !resultText.trim()) {
    return {
      valid: false,
      error: 'Invalid input: resultText must be a non-empty string'
    };
  }

  let parsed;
  try {
    parsed = safeParseJson(resultText);
  } catch (err) {
    return {
      valid: false,
      error: `JSON syntax error: ${err.message}`
    };
  }

  // Kết quả phải là một đối tượng JSON hợp lệ (không phải primitive hoặc null)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return {
      valid: false,
      error: 'Parsed result must be a JSON object'
    };
  }

  // Nếu không có schema hoặc schema không có ràng buộc, trả về kết quả hợp lệ
  if (!schemaObject || typeof schemaObject !== 'object') {
    return {
      valid: true,
      parsedJson: parsed
    };
  }

  // Kiểm tra các trường bắt buộc (required)
  if (Array.isArray(schemaObject.required)) {
    for (const field of schemaObject.required) {
      if (!(field in parsed) || parsed[field] === undefined) {
        return {
          valid: false,
          error: `Missing required field: ${field}`
        };
      }
    }
  }

  // Kiểm tra kiểu dữ liệu các thuộc tính (properties) nếu có
  if (schemaObject.properties && typeof schemaObject.properties === 'object') {
    for (const [propName, propDef] of Object.entries(schemaObject.properties)) {
      if (propName in parsed && parsed[propName] !== undefined && propDef?.type) {
        if (!matchType(parsed[propName], propDef.type)) {
          return {
            valid: false,
            error: `Field '${propName}' must be of type '${propDef.type}', got '${typeof parsed[propName]}'`
          };
        }
      }
    }
  }

  return {
    valid: true,
    parsedJson: parsed
  };
}
