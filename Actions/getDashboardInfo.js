module.exports = {
  data: {
    name: "Get Dashboard Interaction Info"
  },

  info: {
    source: "https://github.com/botpanel/bmd/",
    creator: "The Bot Panel Team",
  },

  category: "Bot Panel",

  UI: [
    {
      element: "var",
      storeAs: "interaction",
      name: "Source Interaction",
    },
    "_",
    {
      element: "typedDropdown",
      storeAs: "get",
      name: "Interaction Info",
      choices: {
        interactionId: { name: "Interaction ID" },
        varname: { name: "Variable Name" },
        guildId: { name: "Server ID" },
        userId:  { name: "User ID" },
        inputType: { name: "Input Type" },
        data: { name: "New Value" }
      }
    },
    "-",
    {
      element: "store",
      storeAs: "store",
      name: "Store Interaction Value"
    }
  ],

  subtitle: (values, constants, thisAction) => {
    return `${thisAction.UI.find(e => e.element == 'typedDropdown').choices[values.get.type].name} of ${constants.variable(values.interaction)} - Store As: ${constants.variable(values.store)}`
  },

  async run(values, message, client, bridge) {
    let interaction = bridge.get(values.interaction)?.d;

    if (!interaction) return;

    let result = interaction[values.get.type];

    bridge.store(values.store, result);
  }
}
