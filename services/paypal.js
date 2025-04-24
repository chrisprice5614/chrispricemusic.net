const axios = require('axios')

async function generateAccessToken() {
    const response = await axios({
        url: process.env.PAYPAL_BASE_URL + '/v1/oauth2/token',
        method: 'post',
        data: 'grant_type=client_credentials',
        auth: {
            username: process.env.PAYPAL_CLIENT_ID,
            password: process.env.PAYPAL_SECRET
        }
    })

    return response.data.access_token
}


exports.createOrder = async (listOfItems) => {
    const accessToken = await generateAccessToken()


    let preCost = 0;

    listOfItems.forEach((curItem) => {
        preCost += Number(curItem.unit_amount.value)
    });

    const finalTotal = preCost.toFixed(2);

    console.log(finalTotal);


    const response = await axios({
        url: process.env.PAYPAL_BASE_URL +'/v2/checkout/orders',
        method: 'post',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        },
        data: JSON.stringify({
            intent: 'CAPTURE',
            purchase_units: [
                {
                    items: listOfItems,

                    amount: {
                        currency_code: 'USD',
                        value: finalTotal,
                        breakdown: {
                            item_total: {
                                currency_code: 'USD',
                                value: finalTotal
                            }
                        }
                    }
                }
            ],

            application_context: {
                return_url: process.env.PAYPAL_REDIRECT_BASE_URL + '/complete-order',
                cancel_url: process.env.PAYPAL_REDIRECT_BASE_URL + '/cancel-order',
                shipping_preference: "NO_SHIPPING",
                user_action: "PAY_NOW",
                brand_name: "Chris Price Music"
            }
        })
    })

    return response.data.links.find(link =>link.rel === 'approve').href
}

exports.capturePayment = async (orderId) => {
    const accessToken = await generateAccessToken();

    const response = await axios({
        url: process.env.PAYPAL_BASE_URL + `/v2/checkout/orders/${orderId}/capture`,
        method: "post",
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + accessToken
        }
    })

    return response.data
}