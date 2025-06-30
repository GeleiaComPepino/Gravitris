const express = require('express')
const app = express()
const port = 8080

app.get('/', (req, res) => {
  res.sendFile(`${__dirname}/GameContent/index.html`)
})
app.get('/script.js', (req, res) => {
  res.sendFile(`${__dirname}/GameContent/script.js`)
})
app.get('/style.css', (req, res) => {
  res.sendFile(`${__dirname}/GameContent/style.css`)
})
app.get('/font.ttf', (req, res) => {
  res.sendFile(`${__dirname}/GameContent/font.ttf`)
})

app.listen(port, () => {
  console.log(`Game listening on port ${port}`)
})