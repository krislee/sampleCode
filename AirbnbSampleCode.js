/* ------- SNIPPETS OF CODE FROM ELECOMMERCE PROJECT BELOW ------- */

/* ------------------------------------------------------------------ */
/* ------- SERVER-SIDE WEBHOOK (USING EXPRESS AND STRIPE API) ------- */
/* ------------------------------------------------------------------ */

const webhook = async (req, res) => {
    // First, check if webhook signing is configured.
    let data, eventType;
    if (process.env.STRIPE_WEBHOOK_SECRET) {
        // Retrieve the event by verifying the signature using the raw body and secret.
        let event;
        let signature = req.headers["stripe-signature"];
        try {
            event = stripe.webhooks.constructEvent(
                req.rawBody,
                signature,
                process.env.STRIPE_WEBHOOK_SECRET
            );

            data = event.data;
            eventType = event.type;

        } catch (err) {
            return res.sendStatus(400);
        }
        
    } else {
        // If there is no webhook signing, then we can retrieve the event data directly from the request body.
        data = req.body.data;
        eventType = req.body.type;
    }

    
    // Listen to the events:

    // Customer’s payment succeeded
    if (eventType === "payment_intent.succeeded") {
        
        try {
            // If there is a Stripe customer ID, then it indicates user is logged in since we create a Stripe customer (just once) when creating a payment intent for logged in users.
            if(data.object.customer) {  

                // Need to get the logged in user's document ID for updating last used shipping address and creating an order. To find the logged in user, use the Stripe customer's ID that was attached to logged in user's document during payment intent creation.
                const loggedInUser = await BuyerUser.findOne({customer: data.object.customer})

                // Check if there is already a last used shipping address that is different from the one that just used, and remove it
                const previousLastUsedAddress = await BuyerShippingAddress.findOne({LastUsed: true, Buyer: loggedInUser._id})
               
                if(previousLastUsedAddress && (String(previousLastUsedAddress._id) !== data.object.metadata.lastUsedShipping)) {
                        previousLastUsedAddress.LastUsed = false
                        previousLastUsedAddress.save()
                }

                const shippingAddress = data.object.shipping.address

                if(data.object.metadata.saveShipping === "true") {
                    const savedShipping = await BuyerShippingAddress.create({
                        Name: data.object.shipping.name,
                        Address: `${shippingAddress.line1}, ${shippingAddress.line2}, ${shippingAddress.city}, ${shippingAddress.state}, ${shippingAddress.postal_code}`,
                        Buyer: loggedInUser._id,
                        LastUsed: true
                    })
                } else {
                    // Add the lastUsed property to the address last used to checkout if the address just used is not the same as the previous order's shipping address
                    const lastUsedAddress = await BuyerShippingAddress.findOneAndUpdate({_id: data.object.metadata.lastUsedShipping, Buyer: loggedInUser._id}, {LastUsed: true}, {new: true})    
                }

                // Omitted some code for brevity
                
                // Continuing code:
                const updateOrderWithShippingAndPayment = await Order.findOneAndUpdate({_id: order._id}, {
                    Shipping: {
                        Name: data.object.shipping.name,
                        Address: `${shippingAddress.line1}, ${shippingAddress.line2}, ${shippingAddress.city}, ${shippingAddress.state}, ${shippingAddress.postal_code}`
                    }
                    // Omitted some code brevity
                }, {new: true})

                // Omitted some code for brevity
                
                // Continuing code:
                // Send back order to client via websocket. The socket is stored on req.io object from server middleware.
                req.io.to(socketID).emit("completeOrder", {
                    order: updateOrderWithShippingAndPayment
                    // Omitted some code brevity
                })
            } else {
                // For guest customers:
                try {
                    // Omitted some code for brevity
                
                    // Continuing code:
                    const shipping = data.object.shipping.address
                    const updateOrderWithShippingAndPayment = await Order.findOneAndUpdate({_id: order._id}, {
                        Shipping: {
                            Name: data.object.shipping.name,
                            Address: `${shipping.line1}, ${shipping.line2}, ${shipping.city}, ${shipping.state}, ${shipping.postal_code}`
                        }
                        // Omitted some code brevity
                    }, {new: true})
                    
                    // Omitted some code for brevity
                
                    // Continuing code:
                    // Send back order to client via websocket. The socket is stored on req.io object from server middleware.
                    req.io.to(socketID).emit("completeOrder", {
                        order: updateOrderWithShippingAndPayment
                        // Omitted some code brevity
                    })
                } catch(error) {
                    console.log(error)
                }
            }
        } catch(error) {
            console.log(error)
        }
    } 
   // Omitted some code for brevity
}


/* ------------------------------------------------------------------ */
/* ------- CLIENT-SIDE (USING REACT) ------- */
/* ------------------------------------------------------------------ */

const addNewShipping = async() => {
    const checkbox = document.querySelector('input[name=saveAddress]')

    // We want to always update the Payment Intent when we click Next so that it stores the most up to date shipping for both guest and logged in users. For logged in user who has saved shipping addresses or is saving an address for the first time, we also want to highlight it as the last used shipping in our Payment Intent. The payment intent webhook will create a new address with LastUsed property with a true value if saving an address for the first time. The payment webhook will update the saved address with LastUsed property with a true value. If logged in user does not have any saved address, the payment webhook won't do anything to the addresses.
    if(loggedIn()) {
        const updatePaymentIntentWithShippingResponse = await fetch(`${backend}/order/payment-intent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'idempotency-key': cartID, // cartID is a state passed from CheckoutPage component; cartID state value set in CheckoutPage component's useEffect
                'Authorization': loggedIn()
            },
            body: JSON.stringify({
                address: {
                    name: `${shippingInput.firstName}, ${shippingInput.lastName}`,
                    line1: shippingInput.line1,
                    line2: shippingInput.line2,
                    city: shippingInput.city,
                    state: shippingInput.state,
                    postalCode: shippingInput.postalCode,
                    phone: shippingInput.phone.replace(/\D/g,''),
                },
                saveShipping: (checkbox && checkbox.checked) ? true : false,
                lastUsedShipping: shipping.firstName ? shipping.id : undefined
            })
        })
        const updatePaymentIntentWithShippingData = await updatePaymentIntentWithShippingResponse.json()
    } else {
        if(prevLoggedIn && !loggedIn()) return // if logged in user, who does not have any shipping address saved, clears local storage and then clicks next, we do not want to continue updating payment intent; 

        // Guest user fetches to this route to update payment intent to include shipping address:
        const updatePaymentIntentWithShippingResponse = await fetch(`${backend}/order/payment-intent`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'idempotency-key': cartID
            },
            credentials: 'include',
            body: JSON.stringify({
                address: {
                    name: `${shippingInput.firstName}, ${shippingInput.lastName}`,
                    line1: shippingInput.line1,
                    line2: shippingInput.line2,
                    city: shippingInput.city,
                    state: shippingInput.state,
                    postalCode: shippingInput.postalCode,
                    phone: shippingInput.phone.replace(/\D/g,''),
                },
                saveShipping: false
            })
        })
        const updatePaymentIntentWithShippingData = await updatePaymentIntentWithShippingResponse.json()

        if(updatePaymentIntentWithShippingData.message === "Please add an item to cart to checkout.") {
            grabTotalCartQuantity(0);
            return grabRedirect(true)
        } 
    }
}