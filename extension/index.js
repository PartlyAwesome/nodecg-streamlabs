const EventEmitter = require('events')
const io = require('socket.io-client')

module.exports = nodecg => {
  if (!nodecg.bundleConfig) {
    nodecg.log.error('No bundleConfig found, nodecg-streamlabs will not work without a configuration. Exiting.')
    return
  }
  if (typeof nodecg.bundleConfig.socket_token !== 'string') {
    nodecg.log.error('No socket_token value present in bundleConfig, nodecg-streamlabs will not work without a socket_token. Exiting')
    nodecg.log.error('socket_token value: ' + nodecg.bundleConfig.socket_token)
    return
  }

  // Default options
  const opts = {
    reconnect: true
  }
  // Apply options to defaults if they exist
  if (typeof nodecg.bundleConfig.socketio === 'object') {
    for (const i in nodecg.bundleConfig.socketio) { // eslint-disable-line guard-for-in
      opts[i] = nodecg.bundleConfig.socketio[i]
    }
  }

  const socket = io.connect(`https://sockets.streamlabs.com/?token=${nodecg.bundleConfig.socket_token}`, opts)
  const emitter = new EventEmitter()
  const history = require('./history')(nodecg)

  socket.on('event', event => { // eslint-disable-line complexity
    if (!event) {
      nodecg.log.error('StreamLabs event NULL error')
      return
    }
    // For people who wanna handle some of the dirty work themselves
    nodecg.sendMessage('rawEvent', event)
    emitter.emit('rawEvent', event)
    nodecg.log.info('StreamLabs Event Occured')

    // I don't think StreamLabs uses more or less than one message per event.message, but just in case
    if (!event.message) {
      nodecg.log.error('StreamLabs event.message NULL error')
      nodecg.log.error('event = ' + event)
      return
    }
    const unformatted = event.message.pop()
    // No message? Must be an error, so we skip it because we already do raw emits.
    if (!(unformatted instanceof Object)) {
      nodecg.log.error(`Event ${event.event_id} had no ites in its event.message property, skipping.`)
    }

    switch (event.type) {
      case 'donation': {
        // Donations are StreamLabs specific
        const message = {
          id: unformatted.id || unformatted._id || null,
          name: unformatted.name,
          amount: {
            amount: unformatted.amount,
            currency: unformatted.currency
          },
          formatted_amount: unformatted.formatted_amount
        }
        nodecg.sendMessage('donation', message)
        emitter.emit('donation', message)
        nodecg.log.info('It was a donation!')
        nodecg.log.info('From: ' + message.name)
        nodecg.log.info('For: ' + message.formatted_amount)
        nodecg.log.info('In: ' + message.amount.currency)
        nodecg.log.info('RawValue: ' + message.amount.amount)

        history.add({
          type: 'donation',
          message
        })
        break
      }
      case 'follow': {
        // Twitch follow == YouTube subscription == Mixer follow
        const message = {
          id: unformatted.id || unformatted._id || null,
          name: unformatted.name,
          when: unformatted.created_at || unformatted.publishedAt || null
        }
        const typeMessage = {
          type: 'follow',
          message
        }

        if (event.for === 'twitch_account') {
          nodecg.sendMessage('twitch-follow', message)
          emitter.emit('twitch-follow')
          nodecg.log.info('It was a twitch follow!')
          nodecg.log.info('From: ' + message.name)
          nodecg.log.info('When: ' + (unformatted.created_at || 'no time given'))

          nodecg.sendMessage('twitch-event', typeMessage)
          emitter.emit('twitch-event', typeMessage)
        } else if (event.for === 'youtube_account') {
          nodecg.sendMessage('youtube-subscription', message)
          emitter.emit('youtube-subscription', message)
          nodecg.log.info('It was a youtube subscription!')

          nodecg.sendMessage('youtube-event', typeMessage)
          emitter.emit('youtube-event', typeMessage)
        } else if (event.for === 'mixer_account') {
          nodecg.sendMessage('mixer-follow', message)
          emitter.emit('mixer-follow', message)

          nodecg.sendMessage('mixer-event', typeMessage)
          emitter.emit('mixer-event', typeMessage)
        }
        history.add(typeMessage)
        break
      }
      case 'resub':
      case 'subscription': {
        // Twitch sub == YouTube sponsor == Mixer subscription
        const message = {
          id: unformatted._id || null,
          name: unformatted.name,
          message: unformatted.message || null,
          months: unformatted.months || 1
        }
        const typeMessage = {
          type: 'subscription',
          message
        }

        if (event.for === 'twitch_account') {
          nodecg.sendMessage('twitch-subscription', message)
          emitter.emit('twitch-subscription', message)
          nodecg.log.info('It was a twitch sub! GET HYPE!!')
          nodecg.log.info('From: ' + message.name)
          nodecg.log.info('For: ' + message.months)
          nodecg.log.info('Message: ' + message.message)

          nodecg.sendMessage('twitch-event', typeMessage)
          emitter.emit('twitch-event', typeMessage)
        } else if (event.for === 'youtube_account') {
          nodecg.sendMessage('youtube-sponsor', message)
          emitter.emit('youtube-sponsor', message)

          typeMessage.type = 'sponsor'
          nodecg.sendMessage('youtube-event', typeMessage)
          emitter.emit('youtube-event', typeMessage)
        } else if (event.for === 'mixer_account') {
          nodecg.sendMessage('mixer-subscription', message)
          emitter.emit('mixer-subscription', message)

          nodecg.sendMessage('mixer-event', typeMessage)
          emitter.emit('mixer-event', typeMessage)
        }
        history.add(typeMessage)
        break
      }
      case 'raid':
      case 'host': {
        // Twitch host == Mixer host, no YouTube equivalent
        const message = {
          id: unformatted._id || null,
          name: unformatted.name,
          viewers: Number(unformatted.viewers || unformatted.raiders),
          type: event.type
        }
        const typeMessage = {
          type: 'host',
          message
        }

        if (event.for === 'twitch_account') {
          nodecg.sendMessage('twitch-host', message)
          emitter.emit('twitch-host', message)
          nodecg.log.info('It was a twitch host/raid! THANK THEM!')
          nodecg.log.info('Type: ' + message.type)
          nodecg.log.info('From: ' + message.name)
          nodecg.log.info('For: ' + message.viewers)

          nodecg.sendMessage('twitch-event', typeMessage)
          emitter.emit('twitch-event', typeMessage)
        } else if (event.for === 'mixer_account') {
          nodecg.sendMessage('mixer-host', message)
          emitter.emit('mixer-host', message)

          nodecg.sendMessage('mixer-event', typeMessage)
          emitter.emit('mixer-event', typeMessage)
        }
        history.add(typeMessage)
        break
      }
      case 'bits':
      case 'superchat': {
        // Twitch bits == YouTube superchats, no Mixer equivalent
        const message = {
          id: unformatted.id || unformatted._id || null,
          name: unformatted.name,
          amount: unformatted.amount,
          message: unformatted.message || unformatted.comment || null
        }

        if (event.for === 'twitch_account') {
          nodecg.sendMessage('twitch-bits', message)
          emitter.emit('twitch-bits', message)
          nodecg.log.info("It's some bits!")
          nodecg.log.info('From: ' + message.name)
          nodecg.log.info('For: ' + message.amount)
          nodecg.log.info('Message: ' + message.message)

          const typeMessage = {
            type: 'bits',
            message
          }

          nodecg.sendMessage('twitch-event', typeMessage)
          emitter.emit('twitch-event', typeMessage)
          history.add(typeMessage)
        } else if (event.for === 'youtube_account') {
          // There are some extra values we wanna add to the message if it's for youtube
          message.currency = unformatted.currency
          message.display_string = unformatted.displayString
          nodecg.sendMessage('youtube-superchat', message)
          emitter.emit('youtube-superchat', message)

          const typeMessage = {
            type: 'superchat',
            message
          }
          nodecg.sendMessage('youtube-event', typeMessage)
          emitter.emit('youtube-event', typeMessage)
          history.add(typeMessage)
        }
        break
      }
      default:
        // We don't really need a default here, as we emit all events anyways under rawEvent
        nodecg.log.info('Unhandled "' + event.type + '" event!')
        break
    }
  })

  return emitter
}
