/**
 * test/node-rpc-test.js - Node RPC tests for hsd
 * Copyright (c) 2020, The Handshake Developers (MIT Licence)
 * https://github.com/handshake-org/hsd
 */

/* eslint-env mocha */
/* eslint prefer-arrow-callback: "off" */

'use strict';

const assert = require('bsert');
const FullNode = require('../lib/node/fullnode');
const {NodeClient} = require('hs-client');

const ports = {
  p2p: 49331,
  node: 49332,
  wallet: 49333
};
const node = new FullNode({
  network: 'regtest',
  apiKey: 'foo',
  walletAuth: true,
  memory: true,
  workers: true,
  workersSize: 2,
  port: ports.p2p,
  httpPort: ports.node
});

const nclient = new NodeClient({
  port: ports.node,
  apiKey: 'foo',
  timeout: 15000
});

describe('RPC', function() {
  this.timeout(15000);

  before(async () => {
    await node.open();
    await nclient.open();
  });

  after(async () => {
    await nclient.close();
    await node.close();
  });

  describe('getblock', function () {
    it('should rpc getblock', async () => {
      const {chain} = await nclient.getInfo();
      const info = await nclient.execute('getblock', [chain.tip]);

      const properties = [
        'hash', 'confirmations', 'strippedsize',
        'size', 'weight', 'height', 'version',
        'versionHex', 'merkleroot', 'witnessroot',
        'treeroot', 'reservedroot', 'mask',
        'coinbase', 'tx', 'time', 'mediantime',
        'nonce', 'bits', 'difficulty', 'chainwork',
        'nTx', 'previousblockhash', 'nextblockhash'
      ];

      for (const property of properties)
        assert(property in info);

      assert.deepEqual(chain.height, info.height);
      assert.deepEqual(chain.tip, info.hash);
      assert.deepEqual(chain.treeRoot, info.treeroot);
    });

    it('should return correct height', async () => {
      const address = 'rs1qjjpnmnrzfvxgqlqf5j48j50jmq9pyqjz0a7ytz';

      // Mine two blocks.
      await nclient.execute('generatetoaddress', [2, address]);

      const {chain} = await nclient.getInfo();
      const info = await nclient.execute('getblock', [chain.tip]);

      // Assert the heights match.
      assert.deepEqual(chain.height, info.height);
    });

    it('should return confirmations (main chain)', async () => {
      const {chain} = await nclient.getInfo();

      const {genesis} = node.network;
      const hash = genesis.hash.toString('hex');

      const info = await nclient.execute('getblock', [hash]);
      assert.deepEqual(chain.height, info.confirmations - 1);
    });

    it('should return confirmations (post reorg)', async () => {
      // Get the current chain state
      const {chain} = await nclient.getInfo();

      // Get the chain entry associated with
      // the genesis block.
      const {genesis} = node.network;
      let entry = await node.chain.getEntry(genesis.hash);

      // Reorg from the genesis block.
      for (let i = 0; i < chain.height + 1; i++) {
        const block = await node.miner.mineBlock(entry);
        await node.chain.add(block);
        entry = await node.chain.getEntry(block.hash());
      }

      // Call getblock using the previous tip
      const info = await nclient.execute('getblock', [chain.tip]);
      assert.deepEqual(info.confirmations, -1);
    });

    it('should return confirmations (alternate)', async () => {
      // Get a previous blockheight
      const height = node.chain.height - 2;
      assert(height > 0);

      // Get the entry and mine on it.
      const entry = await node.chain.getEntryByHeight(height);

      const block = await node.miner.mineBlock(entry);
      assert(await node.chain.add(block));

      const hash = block.hash().toString('hex');
      const info = await nclient.execute('getblock', [hash]);
      assert.deepEqual(info.confirmations, -1);
    });
  });
});
