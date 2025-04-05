const { ChannelTypes } = require("oceanic.js");

module.exports = {
  data: {
    name: "Initialize Dashboard Connection",
  },

  info: {
    source: "https://github.com/botpanel/bmd/",
    creator: "The Bot Panel Team",
  },

  category: "Bot Panel",

  UI: [
    {
      element: "text",
      text: "This action is for setting up the connection with dashboard <code>https://botpanel.xyz</code>."
    },
    {
      element: "text",
      text: "Make sure to place it under <code>Bot ready</code> event."
    },
    "-",
    {
      element: "input",
      storeAs: "appID",
      name: "Application ID",
    },
    {
      element: "input",
      storeAs: "appSecret",
      name: "Application Secret",
    },
    "-",
    {
      element: "text",
      text: "<h style='font-size: 25px; padding-top:5px'>Dashboard Variables</h>"
    },
    {
        element: "text",
        text: "Variables are used for components on the dashboard. You can use a server/global variable or call a command/event and specify the stored temporary variable. The variable should be an object containing the names of each dashboard variable and their values."
    },
    {
      element: "input",
      name: "Command / Event ID",
      placeholder: "Optional",
      storeAs: "customID"
    },
    {
      element: "variable",
      storeAs: "dashboardVars",
      name: "Dashboard Variable Object Input",
    },
    "-",
    {
      element: "text",
      text: "Debug Options"
    },
    {
        element: "toggle",
        storeAs: "debug",
        name: "Debug Mode",
    },
    {
      element: "input",
      storeAs: "wsurl",
      name: "Websocket URL (For development purposes only. Do not use.)",
    }
  ],

  compatibility: ["Any"],

  script: (data) => {
    setTimeout(() => {
      data.document.getElementById("appSecret").setAttribute("type", "password");
    }, 100);
  },

  async run(values, msg, client, bridge) {
    const WebSocket = require("ws");
    const WS_VERSION = "1.1.0";
    let allowReconnect = true;
    let heartbeat;

    console.log("[Bot Panel] Initializing...");
    if (!client.dashboard) {
      client.dashboard = {};
      client.dashboard.events = {};
    }

    let isReconnecting = false;

    const connect = () => {
      const ws = new WebSocket(values.wsurl ?? "wss://wss.botpanel.xyz/");


      const timeout = setTimeout(() => {
        console.log("[Bot Panel] Connection timeout, retrying...");
        ws.terminate();
        if (allowReconnect) {
          isReconnecting = true;
          setTimeout(connect, 5000);
        }
      }, 5000);

      ws.on("open", () => {
        console.log("[Bot Panel] Initialized.");
        clearTimeout(timeout);
        isReconnecting = false;
      });

      ws.on("close", () => {
        clearInterval(heartbeat);
        if (!isReconnecting) {
          console.log("[Bot Panel] Connection closed.");
          if (allowReconnect) {
            isReconnecting = true;
            setTimeout(connect, 5000);
          }
        }
      });

      ws.on("error", (err) => {
        if (!isReconnecting) {
          console.log(`[Bot Panel] Error: ${err}`);
          if (allowReconnect) {
            isReconnecting = true;
            setTimeout(connect, 5000);
          }
        }
      });

      ws.on("message", (message) => handleMessage(message, appID, appSecret));

      client.dashboard.ws = ws;
    }

    connect();

    const appID = bridge.transf(values.appID);
    const appSecret = bridge.transf(values.appSecret);
    const debug = values.debug;

    const OP_CODES = {
      AUTHENTICATE: 0,
      AUTH_SUCCESS: 1,
      ERROR: 2,
      GUILD_INTERACTION: 4,
      REQUEST_GUILD_DATA: 5,
      MODIFY_GUILD_DATA: 6,
      ACKNOWLEDGE_INTERACTION: 7,
      HEARTBEAT: 8
    };

    client.dashboard.OP_CODES = OP_CODES;

    const operationHandlers = {
      [OP_CODES.AUTHENTICATE]: ({ appID, appSecret }) => {
        console.log("[Bot Panel] Attempting to authenticate...");
        client.dashboard.ws.send(JSON.stringify({
          op: OP_CODES.AUTHENTICATE,
          d: {
            connectAs: "application",
            applicationId: appID,
            applicationSecret: appSecret,
            version: WS_VERSION
          }
        }));
      },
      [OP_CODES.AUTH_SUCCESS]: ({ data, appID }) => {
        console.log(`[Bot Panel] Successfully authenticated with application "${data.d.name}" (${appID})!`);
        clearInterval(heartbeat);
        interval = setInterval(() => {
          client.dashboard.ws.send(JSON.stringify({
            op: OP_CODES.HEARTBEAT
          }));
        }, data.d.heartbeatInterval);
      },
      [OP_CODES.ERROR]: ({ data }) => {
        if (data.d.error === "Invalid websocket version. UPDATE EXTENSION.") allowReconnect = false;
        console.log(`[Bot Panel] Error: ${data.d.error}`);
      },
      [OP_CODES.GUILD_INTERACTION]: async ({ data: { d: { guildId, interactionId, include } } }) => {
        let guild, guildChannels = [], roles = [], data = {};
        let variables

        try {
          guild = await client.rest.guilds.get(guildId);
          data = bridge.data.IO.get().guilds[guildId];
          guildChannels = include.some(i => ["textChannels", "voiceChannels", "categories"].includes(i)) ? await guild.getChannels() : [];
          roles = include.includes("roles") ? await guild.getRoles() : [];
        } catch (e) {
          console.log(`[Bot Panel] Error fetching data: ${e}`);
        }

        bridge.guild = guild;

        const categories = [], textChannels = [], voiceChannels = [];

        const channelTypes = {
          [ChannelTypes.GUILD_TEXT]: textChannels,
          [ChannelTypes.GUILD_VOICE]: voiceChannels,
          [ChannelTypes.GUILD_CATEGORY]: categories
        };

        guildChannels.forEach(({ id, name, position, type }) => {
          const channelData = { id, name, position };
          const channelType = channelTypes[type];
          if (channelType) {
            channelType.push(channelData);
          }
        });

        if (values.customID) {
          let prjdata = require('../data.json');
          let commands = prjdata.commands;
          for (let cmd in commands) {
            let command = commands[cmd];
            if (command.customId == bridge.transf(values.customID)) {
              await bridge.runner(cmd);
            }
          }
        };

        roles = roles.map(({ id, name, position, managed }) => ({ id, name, position, managed }));

        const dataToSend = {
          op: OP_CODES.REQUEST_GUILD_DATA,
          d: {
            interactionId,
            variables: values.dashboardVars.value != "" ? bridge.get(values.dashboardVars) : null,
            data: data || {},
            inGuild: !!guild,
            online: true
          }
        };
        const items = ["textChannels", "voiceChannels", "categories", "roles"];

        items.forEach(item => {
          if (include.includes(item)) {
            dataToSend.d[item] = eval(item);
          }
        });

        try {
          client.dashboard.ws.send(JSON.stringify(dataToSend));
        } catch (e) {
          console.log(`[Bot Panel] Error sending guild data: ${e}`);
        }
      },
      [OP_CODES.MODIFY_GUILD_DATA]: async ({ data }) => {
        client.dashboard.events.dashboardDataUpdate(data);
      },
    };

    const handleMessage = async (message, appID, appSecret) => {
      let data;
      try {
        data = JSON.parse(message);
      } catch (e) {
        console.log(`[Bot Panel] Error parsing message: ${e}`);
        return;
      }

      if (debug)
        console.log(`[Bot Panel] Received message: ${JSON.stringify(data)}`);

      const handler = operationHandlers[data.op];
      if (handler) {
        try {
          await handler({ data, appID, appSecret });
        } catch (e) {
          console.log(`[Bot Panel] Error handling message: ${e}`);
        }
      }
    };
  }
}
