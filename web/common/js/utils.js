import { api } from "../../../../scripts/api.js";

export function chainCallback(object, property, callback) {
  if (object == undefined) {
      console.error('Tried to add callback to non-existent object');
      return;
  }
  if (property in object) {
      const callback_orig = object[property];
      object[property] = function () {
          const r = callback_orig.apply(this, arguments);
          callback.apply(this, arguments);
          return r;
      };
  } else {
      object[property] = callback;
  }
}

export async function fetchSend(route, id, operation, payload=null) {
  let requestOptions = {
    method: "POST",
    headers: { "Content-Type": "application/json" }
  };

  const messageBody = {
    id: id,
    operation: operation
  };
  
  // Add payload if provided
  if (payload !== null) {
    messageBody.payload = payload;
  }
  
  requestOptions.body = JSON.stringify(messageBody);

  try {
    const response = await api.fetchApi(route, requestOptions);
    if (!response.ok) {
      throw new Error(`Error: ${response.status} - ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`API call to ${route} failed:`, error);
    throw error;
  }
}


export async function getWidget(node, name, maxRetries = 3) {
  const checkWidget = (retries = 0) => {
      return new Promise((resolve) => {
          const widget = node.widgets.find(w => w.name === name);
          if (widget) {
              resolve(widget);
          } else if (retries < maxRetries) {
              requestAnimationFrame(() => resolve(checkWidget(retries + 1)));
          } else {
              console.warn(`Widget "${name}" not found after ${maxRetries} attempts`);
              resolve(null);
          }
      });
  };

  return await checkWidget();
};

export async function getWidgets(node, target, maxRetries = 3) {
    const checkWidgets = (retries = 0) => {
      return new Promise((resolve) => {
        const result = {};
        const allFound = target.every(name => {
          const widget = node.widgets.find(w => w.name === name);
          if (widget) {
            result[name] = widget;
            return true;
          }
          return false;
        });
  
        if (allFound) {
          resolve(result);
        } else if (retries < maxRetries) {
          requestAnimationFrame(() => resolve(checkWidgets(retries + 1)));
        } else {
          console.warn(`Some widgets not found after ${maxRetries} attempts`);
          resolve(result);
        }
      });
    };
  
    return await checkWidgets();
}


