import React, { useContext } from 'react';
import { PayPalButtons } from "@paypal/react-paypal-js";
import { Context } from '../../Context/Context';

const PayPalCheckout = () => {
    const { cart, buyProducts, setCart } = useContext(Context)

    // Calculate total amount
    const total = cart.reduce((acc, item) => acc + item.price * item.quanty, 0).toFixed(2);

    const handleApprove = (data, actions) => {
        return actions.order.capture().then((details) => {
            const name = details.payer.name.given_name;
            alert(`Transaction completed by ${name}`);
            // Clear cart after successful payment
            setCart([]);
            // In a real app, you would save the order to your database here
        });
    };

    return (
        <div style={{ marginTop: '20px', width: '100%' }}>
            <PayPalButtons
                style={{ layout: "vertical" }}
                createOrder={(data, actions) => {
                    return actions.order.create({
                        purchase_units: [
                            {
                                amount: {
                                    value: total,
                                },
                            },
                        ],
                    });
                }}
                onApprove={handleApprove}
                onError={(err) => {
                    console.error("PayPal Error:", err);
                    alert("There was an error processing your payment.");
                }}
            />
        </div>
    );
};

export default PayPalCheckout;
