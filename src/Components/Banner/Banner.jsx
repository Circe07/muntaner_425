import { useState, useEffect, useContext } from 'react'
import { Context } from "../../Context/Context"
import './Banner.css'

const Banner = () => {
  const images = ['/images/man.png', '/images/woman.png']
  const [currentImage, setCurrentImage] = useState(0)
  const { categoryFilter } = useContext(Context)

  useEffect(() => {
    // If a specific filter is set, show that specific image
    if (categoryFilter === 'men') {
      setCurrentImage(0) // man.png
      return
    } else if (categoryFilter === 'women') {
      setCurrentImage(1) // woman.png
      return
    }

    // If 'all', rotate images
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length)
    }, 5000)
    return () => clearInterval(interval)
  }, [images.length, categoryFilter])

  return (
    <div
      className="banner"
      style={{ backgroundImage: `linear-gradient(rgba(0, 0, 0, 0.3), rgba(0, 0, 0, 0.3)), url(${images[currentImage]})` }}
    >
      <div className="banner-container">
        <h1>Spa & Belleza</h1>
        <p>Premium Unisex Grooming</p>
      </div>
    </div>
  )
}

export default Banner