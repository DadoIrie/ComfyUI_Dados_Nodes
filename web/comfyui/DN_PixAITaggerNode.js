import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({chainCallback, fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

let sendHFToken = async (hf_token) => {
  try {
    await fetchSend(
      MESSAGE_ROUTE,
      null,
      "set_hf_token",
      { hf_token }
    );
  } catch (error) {
    console.error("Failed to send Hugging Face token to backend:", error);
  }
};

app.registerExtension({
  name: "DN_PixAITaggerNode",
  settings: [
    {
      id: "dadosNodes.hf_token",
      name: "Hugging Face Token",
      type: "string",
      defaultValue: "",
      category: ["Dado's Nodes", "Access Token", "Hugging Face Token"],
      tooltip: "Hugging Face token for accessing gated models like PixAI Tagger. Don't forget to get granted access on Hugging Face model site",
      async onChange(value) {
        await sendHFToken(value);
      }
    }
  ],
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
    if (nodeData.name !== "DN_PixAITaggerNode") {
      return;
    }

    chainCallback(nodeType.prototype, "onNodeCreated", async function() {
      const token = await window.app.extensionManager.setting.get('dadosNodes.hf_token');
      if (token) {
        sendHFToken(token);
      }
    });

    return nodeType;
  }
});