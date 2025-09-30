import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

let EXTENSION_NAME, MESSAGE_ROUTE, chainCallback, fetchSend;
(async () => {
  const constants = await fetch('/dadosConstants').then(response => response.json());
  EXTENSION_NAME = constants.EXTENSION_NAME;
  MESSAGE_ROUTE = constants.MESSAGE_ROUTE;

  ({chainCallback, fetchSend} =
   await import(`/extensions/${EXTENSION_NAME}/common/js/utils.js`));
})().catch(error => console.error("Failed to load utilities:", error));

app.registerExtension({
  name: "Dados.EventListeners",
  async beforeRegisterNodeDef(nodeType, nodeData, app) {
/*     chainCallback(app.graph, 'onNodeRemoved', async function (node) {
      console.log("(Dados.EventListeners) Node Removed :", node.type, node.id);
      
    });  */
    /* not being triggered app.graph, 'onExecuted' */
    chainCallback(app.graph, 'onExecuted', async function (node) {
      console.log("(Dados.EventListeners) Node Executed :", node.type, node.id);
    });

  }
});

/* api.addEventListener("executing", ({ detail }) => {
  console.log("Node start executing:", detail);
}); */

/* api.addEventListener("executed", ({ detail }) => {
  console.log("Node executed:", detail);
});

 */