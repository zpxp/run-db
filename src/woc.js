/**
 * WoC.js
 *
 * WoC API
 */

const axios = require("axios");
const bsv = require("bsv");
global.EventSource = require("eventsource");
const { default: ReconnectingEventSource } = require("reconnecting-eventsource");
const Centrifuge = require("centrifuge");
const WebSocket = require("ws");

// ------------------------------------------------------------------------------------------------
// Globals
// ------------------------------------------------------------------------------------------------

const RUN_0_6_FILTER = "006a0372756e0105";
const LOU_FILTER = RUN_0_6_FILTER + "034c6f554d";
const RUN_FILTER = RUN_0_6_FILTER + "0d52756";

// ------------------------------------------------------------------------------------------------
// WoC
// ------------------------------------------------------------------------------------------------

class WoC {
	constructor(apiKey, logger) {
		this.logger = logger;
		this.mempoolEvents = null;
	}

	async connect(height, network) {
		this.network = network;
		//  if (network !== '${this.network}') throw new Error(`Network not supported with WoC: ${network}`)
	}

	async disconnect() {
		if (this.mempoolEvents) {
			this.mempoolEvents.close();
			this.mempoolEvents = null;
		}
	}

	async fetch(txid) {
		const response = await axios.get(`https://api.whatsonchain.com/v1/bsv/${this.network}/tx/${txid}/hex`, this.config);
		const detail = await axios.get(`https://api.whatsonchain.com/v1/bsv/${this.network}/tx/hash/${txid}`, this.config);
		const hex = response.data;
		const height = detail.data.blockheight === 0 ? -1 : detail.data.blockheight;
		const time = detail.data.blocktime === 0 ? null : detail.data.blocktime;
		return { hex, height, time };
	}

	async getNextBlock(currHeight, currHash) {
		const height = currHeight + 1;
		console.log("Begin block crawl " + height);
		let res,
			txs = [];
		try {
			if (height) {
				res = await axios.get(`https://api.whatsonchain.com/v1/bsv/${this.network}/block/height/${height}`, this.config);
			}
			const hash = res.data.hash;
			if (!hash) {
				return undefined;
			}
			const time = res.data.time;
			const prevHash = res.data.previousblockhash;
			if (currHash && prevHash !== currHash) return { reorg: true };
			if (res.data.tx !== undefined || res.data.tx !== null) {
				res.data.tx.forEach(tx => {
					txs.push(tx);
				});
			}
			if (res.data.pages) {
				for (let page of res.data.pages.uri) {
					const nes = await axios.get(
						`https://api.whatsonchain.com/v1/bsv/${this.network}/block/hash/${hash}/page/${page}`,
						this.config
					);
					if (nes.data) {
						nes.data.forEach(tx => {
							txs.push(tx);
						});
					}
				}
			}
			let txids = [],
				transactions = [],
				x = 0;
			const mod = txs.length % 20;
			const looptimes = parseInt(txs.length / 20);
			for (let i = 0; i < looptimes; i++) {
				txids = [];
				for (let j = 0; j < 20; j++) {
					txids.push(txs[x]);
					x++;
				}
				const h = await axios.post(`https://api.whatsonchain.com/v1/bsv/${this.network}/txs/hex`, { txids }, this.config);
				if (h.data) {
					h.data.forEach(t => {
						if (t.hex.includes(LOU_FILTER) || t.hex.includes(RUN_FILTER)) {
							transactions.push(t);
						}
					});
				}
			}
			txids = [];
			for (let k = txs.length - 1; k > txs.length - mod; k--) {
				txids.push(txs[k]);
			}
			if (txids.length) {
				const h = await axios.post(`https://api.whatsonchain.com/v1/bsv/${this.network}/txs/hex`, { txids }, this.config);
				if (h.data) {
					h.data.forEach(t => {
						if (t.hex.includes(LOU_FILTER) || t.hex.includes(RUN_FILTER)) {
							transactions.push(t);
						}
					});
				}
			}
			txids = transactions.map(t => t.txid);
			const txhexs = transactions.map(t => t.hex);
			return { height, hash, time, txids, txhexs };
		} catch (e) {
			console.log(e);
			if (e.response && e.response.status === 404) return undefined;
			throw e;
		}
	}

	async listenForMempool(mempoolTxCallback) {
		this.logger.info("Listening for mempool via WoC SSE");

		return new Promise((resolve, reject) => {
			this.mempoolEvents = new Centrifuge(`wss://socket${this.network === "test" ? "-testnet" : ""}.whatsonchain.com/mempool`, {
				websocket: WebSocket
			});

			this.mempoolEvents.on("connect", ctx => {
				console.log("Connected with client ID " + ctx.client + " over " + ctx.transport);
				resolve();
			});

			this.mempoolEvents.close = ctx => {
				console.log("Disconnected.");
			};

			this.mempoolEvents.on("error", ctx => {
				reject(ctx);
			});

			this.mempoolEvents.on("publish", message => {
				const hex = message.data.hex;
				if (hex.includes(RUN_0_6_FILTER + LOU_FILTER)) {
					mempoolTxCallback(message.data.hash, hex);
				}
			});
			this.mempoolEvents.connect();
		});
	}
}

// ------------------------------------------------------------------------------------------------

module.exports = WoC;
