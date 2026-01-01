import { createContext, useState, useEffect } from "react";

export const Context = createContext()

const ContextProvider = ({ children }) => {
    const [cart, setCart] = useState(() => {
        try {
            const savedCart = localStorage.getItem("cart");
            return savedCart ? JSON.parse(savedCart) : [];
        } catch (error) {
            console.error("Error parsing cart from localStorage:", error);
            return [];
        }
    });
    const [isCartOpen, setIsCartOpen] = useState(false)

    const toggleCart = () => setIsCartOpen(!isCartOpen)
    const openCart = () => setIsCartOpen(true)
    const closeCart = () => setIsCartOpen(false)

    const [categoryFilter, setCategoryFilter] = useState('all')
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [products, setProducts] = useState([])

    useEffect(() => {
        fetch("/data.json")
            .then((response) => response.json())
            .then((data) => setProducts(data))
            .catch(err => console.error("Error fetching products:", err))
    }, [])

    useEffect(() => {
        localStorage.setItem("cart", JSON.stringify(cart));
    }, [cart]);

    const toggleMenu = () => setIsMenuOpen(!isMenuOpen)
    const openMenu = () => setIsMenuOpen(true)
    const closeMenu = () => setIsMenuOpen(false)

    const buyProducts = (product, quantity = 1) => {
        const productrepeat = cart.find((item) => item.id === product.id)

        if (productrepeat) {
            setCart(cart.map((item) => (item.id === product.id ? { ...product, quanty: productrepeat.quanty + quantity } : item)))
        } else {
            setCart([...cart, { ...product, quanty: quantity }])
        }
        if (!isCartOpen) openCart()
    }

    const decreaseQuantity = (product) => {
        const productrepeat = cart.find((item) => item.id === product.id)

        if (productrepeat.quanty > 1) {
            setCart(cart.map((item) => (item.id === product.id ? { ...product, quanty: productrepeat.quanty - 1 } : item)))
        }
    }

    const deleteProduct = (id) => {
        const newCart = cart.filter((element) => element.id !== id)
        setCart(newCart)
    }

    return (
        <Context.Provider value={{
            cart,
            setCart,
            buyProducts,
            decreaseQuantity,
            deleteProduct,
            isCartOpen,
            toggleCart,
            openCart,
            closeCart,
            categoryFilter,
            setCategoryFilter,
            isMenuOpen,
            toggleMenu,
            openMenu,
            closeMenu,
            products
        }}>
            {children}
        </Context.Provider>
    )
}

export default ContextProvider