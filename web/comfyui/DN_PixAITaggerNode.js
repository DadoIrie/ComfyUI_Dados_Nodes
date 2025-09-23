import { app } from "../../scripts/app.js"

let EXTENSION_NAME, MESSAGE_ROUTE, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;
  
  ({fetchSend} = 
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));

  app.registerExtension({
    name: "DN_PixAITaggerNode",
    settings: [
      {
        id: "dadosNodes.hf_token",
        name: "Hugging Face Token",
        type: "string",
        defaultValue: "", // No default as requested
        category: ["Dado's Nodes", "Access Token", "Hugging Face Token"],
        tooltip: "Hugging Face token for accessing gated models like PixAI Tagger. Don't forget to get granted access on Hugging Face model site",
        async onChange(value) {
          try {
            await fetchSend(
              MESSAGE_ROUTE,
              null, // No specific node ID for this global setting
              "set_hf_token",
              { hf_token: value }
            );
          } catch (error) {
            console.error("Failed to send Hugging Face token to backend:", error);
          }
        }
      }
    ]
  });
})().catch(error => console.error("Failed to load utilities or register PixAI Tagger settings:", error));