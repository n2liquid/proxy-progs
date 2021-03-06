'use strict';

var assert = require('assert');
var vows = require('vows');
var s = require('sinon');

var LobbyServerTopic = require('./LobbyServer/LobbyServerTopic');
var EndpointStub = require('./common/EndpointStub');
var SocketStub = require('./common/SocketStub');
var safe_topic_setup = require('./common/safe_topic_setup');

vows.describe('A LobbyServer').addBatch
(
	{
		'during bootstrap':
		{
			topic: function ()
			{
				safe_topic_setup.call
				(
					this, function ()
					{
						var topic = new LobbyServerTopic();
						topic.create_lobby();

						return topic;
					}
				);
			},

			'creates a new WebSocket server on the specified port': function (topic)
			{
				var WS = topic.di.WS;

				s.assert.calledOnce(WS.Server);
				s.assert.calledWithNew(WS.Server);
				s.assert.calledWithExactly(WS.Server, s.match({ port: 5555 }));
			},

			'starts listening for connections': function (topic)
			{
				var lobby = topic.lobby;
				var on = topic.server_socket.on;

				s.assert.calledOnce(on);
				s.assert.calledWithExactly(on, 'connection', s.match.func);

				// TODO: find a way to make sure the connection handler
				// calls lobby.on_connect
			}
		},

		'has a connection handler':
		{
			topic: function ()
			{
				safe_topic_setup.call
				(
					this, function ()
					{
						var topic = new LobbyServerTopic();
						topic.create_lobby();

						return topic;
					}
				);
			},

			'which is a function': function (topic)
			{
				assert(typeof topic.lobby.on_connect === 'function', 'on_connect must be a function');
			},

			'which handles a single client socket message': function (topic)
			{
				var lobby = topic.lobby;

				var on_message = s.stub(lobby, 'on_message');

				// test 'once' handler registration
				var client_socket = new SocketStub();
				var once = client_socket.stubs.once;

				lobby.on_connect(client_socket);

				s.assert.calledOnce(once);
				s.assert.calledWithExactly(once, 'message', s.match.func);

				// test handler call to lobby.on_message
				var message = '{}';
				var handler = once.lastCall.args[1];

				handler(message);

				s.assert.calledOnce(on_message);

				// test handler call forwards right arguments
				s.assert.calledWithExactly(on_message, client_socket, message);

				on_message.restore();
			},

			'which sets up the disconnection handler': function (topic)
			{
				var lobby = topic.lobby;

				var on_socket_close = s.stub(lobby, 'on_socket_close');

				// test 'on' handler registration
				var client_socket = new SocketStub();
				var on = client_socket.stubs.on;

				lobby.on_connect(client_socket);

				s.assert.calledOnce(on);
				s.assert.calledWithExactly(on, 'close', s.match.func);

				// test handler call to lobby.on_message
				var handler = on.lastCall.args[1];

				handler();

				s.assert.calledOnce(on_socket_close);

				// test handler call forwards right arguments
				s.assert.calledWithExactly(on_socket_close, client_socket);

				on_socket_close.restore();
			}
		},

		'has a message handler':
		{
			topic: function ()
			{
				safe_topic_setup.call
				(
					this, function ()
					{
						var topic = new LobbyServerTopic();
						topic.create_lobby();

						return topic;
					}
				);
			},

			'which is a function': function (topic)
			{
				assert(typeof topic.lobby.on_message === 'function', 'on_message must be a function');
			},

			'which handles "announce" commands': function (topic)
			{
				var lobby = topic.lobby;

				var on_announce_message = s.stub(lobby, 'on_announce_message');

				var client_socket = new SocketStub();

				var message = JSON.stringify
				({
					command: 'announce',
					endpoint_id: 'test'
				});

				lobby.on_message(client_socket, message);

				s.assert.calledOnce(on_announce_message);

				s.assert.calledWithExactly
				(
					on_announce_message,

					client_socket,
					s.match({ endpoint_id: 'test' })
				);

				on_announce_message.restore();
			},

			'which handles "connect" commands': function (topic)
			{
				var lobby = topic.lobby;

				var on_connect_message = s.stub(lobby, 'on_connect_message');

				var client_socket = new SocketStub();

				var message = JSON.stringify
				({
					command: 'connect',
					endpoint_id: 'test'
				});

				lobby.on_message(client_socket, message);

				s.assert.calledOnce(on_connect_message);

				s.assert.calledWithExactly
				(
					on_connect_message,

					client_socket,
					s.match({ endpoint_id: 'test' })
				);

				on_connect_message.restore();
			},

			'which disconnects clients that send unsupported commands': function (topic)
			{
				var lobby = topic.lobby;

				var client_socket = new SocketStub();
				var close = client_socket.stubs.close;

				lobby.on_message
				(
					client_socket, JSON.stringify
					({
						command: '*unsupported*'
					})
				);

				s.assert.calledOnce(close);
			}
		},

		'has announced endpoints':
		{
			topic: function ()
			{
				safe_topic_setup.call
				(
					this, function ()
					{
						var topic = new LobbyServerTopic();
						topic.create_lobby();

						return topic;
					}
				);
			},

			'created when clients announce': function (topic)
			{
				var lobby = topic.lobby;

				var client_socket_a = new SocketStub();
				var client_socket_b = new SocketStub();

				lobby.on_announce_message(client_socket_a, { endpoint_id: 'test-a' });
				lobby.on_announce_message(client_socket_b, { endpoint_id: 'test-b' });

				var endpoint_a = lobby.endpoint('test-a');
				var endpoint_b = lobby.endpoint('test-b');

				var endpoint_socket_a = endpoint_a.socket;
				var endpoint_socket_b = endpoint_b.socket;

				assert.isObject(endpoint_a);
				assert.equal(endpoint_socket_a, client_socket_a);

				assert.isObject(endpoint_b);
				assert.equal(endpoint_socket_b, client_socket_b);
			},

			'whose getter throws if the ID is not announced': function (topic)
			{
				assert.throws
				(
					function ()
					{
						topic.lobby.endpoint('*unannounced-id*');
					},

					ReferenceError
				);
			},

			'which cannot have duplicate IDs': function (topic)
			{
				var lobby = topic.lobby;

				var client_socket_a = new SocketStub();
				var client_socket_b = new SocketStub();

				var send_b = client_socket_b.stubs.send;
				var close_b = client_socket_b.stubs.close;

				lobby.on_announce_message(client_socket_a, { endpoint_id: 'test' });
				lobby.on_announce_message(client_socket_b, { endpoint_id: 'test' });

				s.assert.calledOnce(send_b);

				s.assert.calledWithExactly
				(
					send_b, JSON.stringify
					({
						error: 'endpoint-already-announced'
					})
				);

				s.assert.calledOnce(close_b);
				s.assert.calledWithExactly(close_b);

				assert(close_b.calledAfter(send_b), 'close must be called after send.');
			}
		},

		'has a connect command handler':
		{
			topic: function ()
			{
				safe_topic_setup.call
				(
					this, function ()
					{
						var topic = new LobbyServerTopic();
						topic.create_lobby();

						// mock an endpoint announcement
						topic.lobby.on_announce_message(new SocketStub(), { endpoint_id: 'prepared-1' });
						topic.lobby.on_announce_message(new SocketStub(), { endpoint_id: 'prepared-2' });
						topic.lobby.on_announce_message(new SocketStub(), { endpoint_id: 'prepared-3' });

						return topic;
					}
				);
			},

			'which connects clients to announced endpoints': function (topic)
			{
				var lobby = topic.lobby;

				var endpoint_id = 'prepared-1';

				var endpoint = new EndpointStub();

				var endpoint_send = endpoint.socket.stubs.send;

				var endpoint_getter = s.stub(lobby, 'endpoint').returns(endpoint);

				var client_socket = new SocketStub();

				var client_send = client_socket.stubs.send;

				lobby.on_connect_message(client_socket, { endpoint_id: endpoint_id });

				s.assert.calledOnce(endpoint_getter);
				s.assert.calledWithExactly(endpoint_getter, endpoint_id);

				endpoint_getter.restore();

				s.assert.calledOnce(endpoint_send);

				s.assert.calledWithExactly
				(
					endpoint_send, JSON.stringify
					({
						'event': 'connected'
					})
				);

				s.assert.calledOnce(client_send);

				s.assert.calledWithExactly
				(
					client_send, JSON.stringify
					({
						'event': 'connected'
					})
				);

				assert(endpoint.socket.bound_to_peer, 'endpoint.socket.bound_to_peer flag should be true.');
				assert.equal(endpoint.socket.peer, client_socket, 'endpoint.socket.peer should be set to client_socket.');

				assert(client_socket.bound_to_peer, 'client_socket.bound_to_peer flag should be true.');
				assert.equal(endpoint.socket.peer, client_socket, 'client_socket.peer should be set to endpoint.socket.');
			},

			'which sets up message relaying for connected endpoints': function (topic)
			{
				var lobby = topic.lobby;

				var endpoint = new EndpointStub();

				var endpoint_socket_send = endpoint.socket.stubs.send;
				var endpoint_socket_on = endpoint.socket.stubs.on;

				s.stub(lobby, 'endpoint').returns(endpoint);

				var client_socket = new SocketStub();

				var client_socket_send = client_socket.stubs.send;
				var client_socket_on = client_socket.stubs.on;

				lobby.on_connect_message(client_socket, { endpoint_id: 'prepared-2' });

				lobby.endpoint.restore();

				// reset spy state, we don't care about previous calls
				client_socket_send.reset();
				endpoint_socket_send.reset();

				function test_relaying (sending_peer_on, receiving_peer_send)
				{
					var message = 'What is this program? A miserable little pile of tests!';

					s.assert.calledOnce(sending_peer_on);
					s.assert.calledWithExactly(sending_peer_on, 'message', s.match.func);

					var on_message_handler = sending_peer_on.lastCall.args[1];

					on_message_handler(message);

					s.assert.calledOnce(receiving_peer_send);
					s.assert.calledWithExactly(receiving_peer_send, message);
				}

				// endpoint -> client
				test_relaying(endpoint_socket_on, client_socket_send);

				// client -> endpoint
				test_relaying(client_socket_on, endpoint_socket_send);
			},

			'which frees up connected endpoint IDs': function (topic)
			{
				var lobby = topic.lobby;

				var subject_endpoint_id = 'prepared-3';

				assert.doesNotThrow
				(
					function ()
					{
						lobby.endpoint(subject_endpoint_id);
					},

					ReferenceError,

					'Endpoint is not announced.'
				);

				var endpoint = new EndpointStub();

				var endpoint_getter = s.stub(lobby, 'endpoint').returns(endpoint);

				var client_socket = new SocketStub();

				lobby.on_connect_message(client_socket, { endpoint_id: subject_endpoint_id });

				endpoint_getter.restore();

				assert.throws
				(
					function ()
					{
						lobby.endpoint(subject_endpoint_id);
					},

					ReferenceError,

					'Endpoint is still announced.'
				);
			}
		},

		'has a disconnection handler':
		{
			topic: function ()
			{
				safe_topic_setup.call
				(
					this, function ()
					{
						var topic = new LobbyServerTopic();
						topic.create_lobby();

						return topic;
					}
				);
			},

			'which disconnects bound peers': function (topic)
			{
				var lobby = topic.lobby;

				// test client with no bound peer
				var client_socket = new SocketStub();
				client_socket.peer = new SocketStub();
				client_socket.bound_to_peer = false;

				var peer_close = client_socket.peer.stubs.close;

				lobby.on_socket_close(client_socket);

				s.assert.notCalled(peer_close);

				// test client with bound peer
				client_socket.bound_to_peer = true;

				lobby.on_socket_close(client_socket);

				s.assert.calledOnce(peer_close);
			}
		}
	}
).export(module);
