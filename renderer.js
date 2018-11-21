'use strict'

window.$ = window.jQuery = require('jquery')
window.Bootstrap = require('bootstrap')

////// SET PAGES 
// Main pages
let pages = ['wallet', 'tokens', 'trade']

// Launch with the first page
openPage(pages[0])

// Navbar Page buttons
pages.forEach(page => {
    $('#nav-' + page).on('click', function(e) {
        openPage(page)
    })
})
////// SET PAGES





let daemon = require('./api/daemon.js')

daemon.readConfig()

let loading = false
let preventWindowClose = false


// On close
let main = require('electron').remote.require('./main.js')
let mainWindow = require('electron').remote.getCurrentWindow()

function setPreventWindowClose(toggle) {
    main.setPreventWindowClose(toggle)
    preventWindowClose = toggle
}

function setLoading(toggle) {
    main.setLoading(toggle)
    loading = status
}

let exitInitialized = false
mainWindow.on('close', e => {
    if(preventWindowClose || loading) {
        e.preventDefault() // Prevents the window from closing 
        console.log('Prevented close request! loading: ' + loading)

        // Prevent spam click, don't enter this if it's just loading
        if(!loading && !exitInitialized) {
            console.log('Window close request, opening encryption screen')

            exitInitialized = true

            stopAll('Stopping the daemon, then you\'ll enter a password to encrypt the wallet...').then(() => {
                inputLock(false)
                promptPasswordScreen('encrypt')
            })
        }
    }
    // Shouldn't reach here but just in case, stop the daemon
    else stopAll('Stopping the daemon...')
})


function stopAll(loading_text) {
    inputLock(true, loading_text)
    return new Promise((resolve, reject) => {
        stopUpdateIntervals()
        daemon.stopDaemon().then(() => {
            resolve()
        })
    })
}







// User data
let Store = require('./api/store.js')
let store = new Store({
  configName: 'user-data',
  defaults: {
    first_privkey: '',
    first_pubkey: '',

    generated_privkey: '',
    generated_pubkey: '',

    pubkey: '',
  }
})





// wallet.dat encryption/decryption
const wallet_dat_path = daemon.getKomodoFolder() + 'wallet.dat'

const { Safe } = require("./api/safe.js")

var safe = new Safe(wallet_dat_path)

// safe.setPassword('papapa')
// safe.encrypt({kek:'kekkeri'})

// Try to decrypt at very start
tryDecrypt().then(result => {
    console.log('Try decrypt: ', result)

    // Password required
    if(result === 'enter_password') promptPasswordScreen('decrypt')
    // START
    else firstLaunch()
})



let updateIntervals = []

function startUpdateIntervals() {
    // TODO: Use events instead of polling
    updateIntervals.push(setInterval(() => updateBalance(), 1000))
    updateIntervals.push(setInterval(() => updateTokenLists(), 5000))
    updateIntervals.push(setInterval(() => updateTokenOrders(), 5000))
}

function stopUpdateIntervals() {
    updateIntervals.forEach(id => { clearInterval(id) })
}


function firstLaunch() {
    // Initialize with the saved pubkey
    init(store.get('pubkey')).then(() => {
        // Disable window close, require 
        setPreventWindowClose(true)
        
        startUpdateIntervals()
    })

}
























// Functions
function tryDecrypt(password) {
    if(password) safe.setPassword(password)

    return safe.decryptFile().then(d => {
        console.log('Decrypted successfully: ' + wallet_dat_path)
        return 'success'
    }).catch(e => {
        if(e.message !== undefined) {
            // No issue: File not found, probably the first time launching the komodod and this app
            if(safe.errFileNotFound(e.message)) {
                console.log('File not found, probably it\'s the first launch: ' + wallet_dat_path)
                return 'file_not_found'
            }
            // Issue: Wrong password, should try again
            else if(safe.errWrongPassword(e.message)) {
                console.log('Wrong password: ' + wallet_dat_path)
                return 'enter_password'
            }
            console.log('Unknown error: ' + e.message + ' for => '+  wallet_dat_path)
            return 'Unknown error'
        }
    })
}

function tryEncrypt(password) {
    safe.setPassword(password)
    if(password === '') {
        return new Promise((resolve, reject) => {
            console.log('Skipping encryption')
            resolve('skip_encryption')
        })
    }
    
    return safe.encryptFile().then(d => {
        return d
    }).catch(e => {
        return e
    })
}

function hidePassword() {    
    $('#input-password').attr("type", "password")
    $('#button-enter-password-show').html('Show')
}

// Toggle password visibility
$('#button-enter-password-show').on('click', function() {
    event.preventDefault()

    let pass = $('#input-password')
    
    let type = pass.attr("type") 

    if(type === 'password'){
        pass.attr("type", "text")
        $('#button-enter-password-show').html('Hide')
    }
    else hidePassword()
})

// Toggle password edit
$('#button-enter-password-edit').click(event => {
    event.preventDefault()
    
    $('#input-password').attr('disabled', !$('#input-password').attr('disabled'))
})


function promptPasswordScreen(type) {
    hidePassword()

    if(type === 'decrypt') {
        $('#input-password').attr('disabled', false)
        $('#button-submit-password').html('Decrypt')
        $('#text-enter-password-small').html('Wallet is <strong>encrypted</strong>. You have to enter the correct password to continue.')

        $('#div-enter-password-edit').hide()
    }
    else if(type === 'encrypt') {
        $('#input-password').attr('disabled', true)
        $('#button-submit-password').html('Encrypt and quit')
        $('#text-enter-password-small').html(`<strong>Be careful! You won't be able to access your wallet if you forget this password.</strong> However, you can skip encryption by leaving the password <strong>empty</strong>.`)

        $('#div-enter-password-edit').show()
    }
    
    $('#button-submit-password').attr('data-action', type)
    $('#input-password').attr('placeholder', 'Enter password to ' + type + ' the wallet.')
    $('#modal-enter-password').modal({ backdrop: 'static', keyboard: false })
}

$('#button-submit-password').click(event => {
    event.preventDefault()

    // TODO: Validate inputs 
    let password = $('#input-password').val()
    let action = $('#button-submit-password').attr('data-action')

    console.log('action:' + action + '  password: ' + password)

    // Hide the error
    $("#status-alert-password").hide()
    
    // Try decrypting
    if(action === 'decrypt') {
        tryDecrypt(password).then(result => {
            if(result === 'enter_password') {
                $("#status-alert-password").show()
            }
            // Successfull decryption
            else {
                // Close the modal
                $('#modal-enter-password').modal('hide')
                firstLaunch()
            }
        })
    }
    else if(action === 'encrypt') {
        $('#button-submit-password').attr('disabled', true)
        console.log('Encrypting...')
        tryEncrypt(password).then(result => {
            console.log(result)
            setPreventWindowClose(false)
            
            mainWindow.close()
        })
    }
})


function init(pubkey) {
    return new Promise((resolve, reject) => {
        inputLock(true, 'Preparing the daemon.')

        // Launch daemon 
        daemon.startUp(pubkey).then(wallet => {
            // Store the key
            store.set('pubkey', wallet.pubkey)

            // Save the new pubkey if generated for first time
            if(wallet.generated) {
                store.set('generated_privkey', wallet.privkey)
                store.set('generated_pubkey', wallet.pubkey)

                console.log('Firstprivkey : ', store.get('first_privkey'))
                if(store.get('first_privkey') === '') {
                    store.set('first_privkey', wallet.privkey)
                    store.set('first_pubkey', wallet.pubkey)
                }
            }

            // // Add block for test
            // let transactions = []
            // for(let i = 0; i < 500; ++i)
            //     transactions.push(daemon.sendToAddress('RKSXk8CSb1tR1WBfx4z4xdedYLHPcPTFTx', 0.01))
            // Promise.all(transactions, () => { console.log('Sent all') })

            // Set UI Values
            updateNewAddress(wallet.address)
            Promise.all([
                updateBalance(),
                updateTokenLists(),
                updateTokenOrders()
            ]).then(() => {
                // Unlock input
                inputLock(false)
                
                resolve()
            })
        }) 
    })
}


$('.alert').hide()
$('.alert .close').on('click', function(e) {
    $(this).parent().hide()
})

$('#form-send').submit(event => {    
    let address = $('#input-address').val()
    let amount = $('#input-amount').val()
    // Validate inputs 
    if(parseFloat(amount) === 0) {
        statusAlert(false, 'Failed to send: Amount can\'t be zero.')
        return false
    }

    // Send to address
    daemon.sendToAddress(address, amount).then(() => {
        updateBalance()

        // Add it to transaction history
        let transaction_text = addTransactionToHistory(address, amount, daemon.getCoinName())

        // Update status text
        statusAlert(true, transaction_text)
    }).catch(e => {
        statusAlert(false, e)
    })

    return false
})


$('#form-token-send').submit(event => {
    let token_line = $('#select-tokens option:selected').text()
    let token_id = $('#select-tokens').val()
    let address = $('#input-token-address').val()
    let amount = $('#input-token-amount').val()

    let line_arr = token_line.split(' ')
    let token_name = line_arr[0] 
    let token_balance = line_arr[line_arr.length-1] 

    // Validate inputs
    if(token_balance < amount) {
        statusAlert(false, 'Failed to send: Not enough tokens. Yet, if you are sure you have it, please wait until the balance is refreshed.')
        return false
    }

    // Send to address
    daemon.sendTokenToAddress(token_id, address, amount).then(txid => {
        // Add it to transaction history
        let transaction_text = addTransactionToHistory(address, amount, token_name, 
                                            '\nTransaction ID: ' + txid) 

        // Update status text
        statusAlert(true, transaction_text)
    }).catch(e => {
        statusAlert(false, e)
    })

    return false
})

function statusAlert(success, text) {
    $('#status-text').html(text)
    
    if(success) {
        // Remove danger
        $("#status-alert").removeClass("alert-danger")
        // Add success
        if(!$("#status-alert").hasClass("alert-success")) $("#status-alert").addClass("alert-success")
    }
    else {
        // Remove success
        $("#status-alert").removeClass("alert-success")
        // Add danger
        if(!$("#status-alert").hasClass("alert-danger")) $("#status-alert").addClass("alert-danger")
    }

    console.log(text)

    $("#status-alert").show()
}

function addTransactionToHistory(address, amount, asset_name, extra='') {
    let transaction_text = 'Sent ' + amount + ' ' + asset_name + ' to ' + address + ' ' + extra;

    addToHistory(transaction_text)
    
    return transaction_text
}

function addToHistory(text) {
    // Add timestamp
    var time = new Date().toTimeString().substr(0, 8)
    text = time + ' - ' + text
    
    let thistory = $('#textarea-history')
    
    let curr_text = thistory.val()
    thistory.val(curr_text + (curr_text === '' ? '' : '\n') + text)

    // Scroll to bottom
    thistory.scrollTop(thistory[0].scrollHeight)

    return text
}


$('#button-show-keys').click(event => {
    event.preventDefault()

    $('#text-first-privkey').val(store.get('first_privkey'))
    $('#text-first-pubkey').val(store.get('first_pubkey'))

    $('#text-last-privkey').val(store.get('generated_privkey'))
    $('#text-last-pubkey').val(store.get('generated_pubkey'))
})




$('#button-change-pubkey').click(event => {
    event.preventDefault()

    // TODO: Validate inputs 
    $('#input-pubkey').val(daemon.getKeyPair().pubkey)
})

$('#form-save-pubkey').submit(event => {
    // Close the modal
    $('#modal-change-pubkey').modal('hide')

    // TODO: Validate inputs 
    let new_pubkey = $('#input-pubkey').val()
    
    if(new_pubkey !== daemon.getKeyPair().pubkey) {
        // Restart the daemon
        stopAll('Restarting the daemon...').then(() => {
            init(new_pubkey).then(() => {
                console.log('Restarted the daemon.')
            })
        })
    }

    return false
})


$('#button-new-address').click(event => {
    event.preventDefault()
    
    // Get a new address
    daemon.getNewAddress().then(address => {
        updateNewAddress(address)
        
        statusAlert(true, addToHistory('Generated a new address: ' + address))
    }).catch(e => {
        statusAlert(false, 'Could not generate new address: ' + e)
    })
})




$('#form-create-token-submit').submit(event => {
    // Close the modal
    $('#modal-create-token').modal('hide')

    let name = $('#input-create-token-name').val()
    let supply = $('#input-create-token-supply').val()
    let description = $('#input-create-token-description').val()

    // Validate inputs 
    if(parseFloat(supply) === 0) {
        statusAlert(false, 'Failed to create token: Supply can\'t be zero.')
        return false
    }
    
    if(name.indexOf(' ') !== -1) {
        statusAlert(false, 'Failed to create token: Name can\'t have spaces.')
        return false
    }

    // Create token
    daemon.createToken(name, supply, description).then(() => {
        statusAlert(true, addToHistory('Created token ' + name + 
                                (description !== '' ? ('(' + description + ')') : '')
                                + ' with ' +  supply + ' ' + daemon.getCoinName()))
    }).catch(e => {
        statusAlert(false, 'Failed to create token: ' + e)
    })

    return false
})



// Create buy / sell orders
['buy', 'sell'].forEach(action => {
    $('#form-token-'+ action +'-order-submit').submit(event => {
        // Close the modal
        $('#modal-token-' + action +'-order').modal('hide')
    
        // TODO: Validate inputs 
        let tokenid = $('#select-token-' + action + '-order').val()
        let price = $('#input-token-' + action + '-order-price').val()
        let supply = $('#input-token-' + action + '-order-supply').val()
        
        // Create token
        daemon.createTokenTradeOrder(action, supply, tokenid, price).then(() => {
            console.log('Created token ' + action + ' order: ', supply, tokenid, price)
        })

        return false
    })
})




function inputLock(toggle, message='') {
    setLoading(toggle)

    $('#button-send').prop('disabled', toggle)
    $('#button-new-address').prop('disabled', toggle)
    $('#button-change-pubkey').prop('disabled', toggle)
    $('#button-save-pubkey').prop('disabled', toggle)
    $('#button-show-keys').prop('disabled', toggle)

    if(toggle) {
        $("#loader-txt").html(message)

        $("#loader").modal({
            backdrop: "static", // Remove ability to close modal with click
            keyboard: false, // Remove option to close with keyboard
            show: true // Display loader!
        })
    }
    else {
        $("#loader").modal("hide")
    }
}

// Update balance
function updateBalance() {
    return daemon.getBalance().then(balance => {
        $('#balance').val(balance + ' ' + daemon.getCoinName())
    })
}

// Update address
function updateNewAddress(address) {
    $('#text-new-address').val(address)
}

// Update token list
function updateTokenLists() {
    return daemon.getTokenList().then(list => {
        const selects = ['#select-tokens', '#select-token-buy-order', '#select-token-sell-order']

        // Remove all
        selects.forEach(s => {
            // Get current selection
            let curr_selected = $(s + ' option:selected').val()

            $(s).children().remove()

            // Add new ones
            for(var i = 0; i < list.length; ++i) {
                $(s).append('<option value="' + list[i].id + '">' + list[i].name + ' - ' + list[i].balance + '</option>')
            }

            // Remember the selection
            if(curr_selected !== undefined) $(s).val(curr_selected)
        })
    })
}



// Update token list
function updateTokenOrders() {
    return daemon.getTokenOrders().then(list => {
        // Remove all
        $('#table-token-buy').children().remove()
        $('#table-token-sell').children().remove()
        $('#table-token-my-sell').children().remove()
        $('#table-token-my-sell').children().remove()
        
        let my_address = daemon.getKeyPair().CCaddress


        // Add new ones to correct tables
        for(var i = 0; i < list.length; ++i) {
            let order = list[i]
            let buy = order.funcid === 'b' || order.funcid === 'B'
            let sell = order.funcid === 's' || order.funcid === 'S'

            // Reverse, because if you wanna buy, you look at sell-list
            order.action = buy ? 'sell' : sell ? 'buy' : 'unknown-func'

            
            // Available token order tables
            order.real_amount = buy ? order.totalrequired : sell ? order.amount : 'unknown'
            $('#table-token-' + order.action).append(`
                <tr>
                    <td>${order.name}</td>
                    <td>${order.price}</td>
                    <td>${order.real_amount}</td>
                    <td><button data-toggle="modal" data-target="#modal-token-fill-order" 
                                data-action="${order.action}" 
                                data-name="${order.name}" 
                                data-price="${order.price}"
                                data-amount="${order.real_amount}"
                                data-tokenid="${order.tokenid}"
                                data-txid="${order.txid}"
                        class="button-token-fill-order btn btn-primary">${buy ? 'Sell' : 'Buy'}</button></td>
                </tr>
            `)


            // If it's my order, add them to the my orders tables
            if(my_address === order.origaddress) {
                $('#table-token-my-' + order.action).append(`
                    <tr>
                        <td>${order.name}</td>
                        <td>${order.price}</td>
                        <td>${order.real_amount}</td>
                        <td><button 
                            data-type="${buy ? 'bid' : 'ask'}" 
                            data-tokenid="${order.tokenid}" 
                            data-txid="${order.txid}"
                            class="button-token-remove-order btn btn-primary">Remove</button></td>
                    </tr>
                `)            
            }
        }
    })
}


// Remove order
$(document).on('click', '.button-token-remove-order', function() {
    let btn = $(this)

    let type = btn.attr("data-type")
    let tokenid = btn.attr("data-tokenid")
    let txid = btn.attr("data-txid")

    daemon.cancelTokenOrder(type, tokenid, txid).then(() => {
        // Add it to transaction history
        let transaction_text = 'Cancelling token order...'//addTransactionToHistory(address, amount, daemon.getCoinName())

        // Update status text
        statusAlert(true, transaction_text)
    }).catch(e => {
        statusAlert(false, e)
    })
})




// Fill order
$(document).on('click', '.button-token-fill-order', function() {
    let btn = $(this)

    let action = btn.attr("data-action")
    let name = btn.attr("data-name")
    let price = btn.attr("data-price")
    let amount = btn.attr("data-amount")
    let tokenid = btn.attr("data-tokenid")
    let txid = btn.attr("data-txid")
    
    $('#text-token-fill-order-action').html((action === 'buy' ? 'Sell' : 'Buy') + 'ing Token')
    $('#text-token-fill-order-name').val(name)
    $('#input-token-fill-order-price').val(price)
    $('#input-token-fill-order-amount').val(amount)

    $('#button-token-fill-order-submit').attr('data-action', action)
    $('#button-token-fill-order-submit').attr('data-tokenid', tokenid)
    $('#button-token-fill-order-submit').attr('data-txid', txid)
})


// Fill order final submit
$('#form-token-fill-order-submit').submit(event => {
    // Close the modal
    $('#modal-token-fill-order').modal('hide')

    let btn = $('#button-token-fill-order-submit')

    // TODO: Validate inputs 
    let action = btn.attr("data-action")
    let tokenid = btn.attr("data-tokenid")
    let txid = btn.attr("data-txid")
    let count = $('#input-token-fill-order-fill-count').val()


    daemon.fillTokenOrder(action, tokenid, txid, count).then(() => {
        // Add it to transaction history
        let transaction_text = 'Filling token order...'//addTransactionToHistory(address, amount, daemon.getCoinName())

        // Update status text
        statusAlert(true, transaction_text)
    }).catch(e => {
        statusAlert(false, e)
    })

    return false
})

function openPage(page) {
    // Hide other pages
    for(let p of pages) {
        if(p !== page) {
            $('#' + p + '-page-only').hide()
            $('#nav-' + p).toggleClass("active", false)
        }
    }

    // Show this one
    $('#nav-' + page).toggleClass("active", true)
    $('#' + page + '-page-only').show()
}

$("#menu-toggle").click(function(e) {
    e.preventDefault()
    $("#wrapper").toggleClass("toggled")
})
