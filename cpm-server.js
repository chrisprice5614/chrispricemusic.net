require("dotenv").config() // Makes it so we can access .env file
const sanitizeHTML = require("sanitize-html")//npm install sanitize-html
const jwt = require("jsonwebtoken")//npm install jsonwebtoken dotenv
const bcrypt = require("bcrypt") //npm install bcrypt
const cookieParser = require("cookie-parser")//npm install cookie-parser
const express = require("express")//npm install express
const db = require("better-sqlite3")("music.db") //npm install better-sqlite3
const paypal = require("./services/paypal")
const multer = require("multer")
const body_parser = require("body-parser")
const sharp = require("sharp")
const fs = require("fs");
const nodemailer = require("nodemailer")
const Chart = require("chart.js")
const path = require('path');
const { getCompileCacheDir } = require("module")
const stripe = require("stripe")(process.env.STRIPE_PRIVATE_KEY)
const fileStorageEngine = multer.diskStorage({
    
    destination: (req, file, cb) => {
          
        if(file.mimetype != "application/pdf")
        {
            cb(null, "./public/img")
        }
        else
        {
            cb(null, "./pdf")
        }
    },
    filename: (req, file, cb) => {
        
        

        if(req.body.title)
        {
            if(file.mimetype != "application/pdf")
            {
                const uniqueSuffix = Date.now() + "-" + Math.round(Math.random()*1e9);
                const newName = req.body.title.replace(/\s/g, '')
                cb(null, newName + "-" + uniqueSuffix + path.extname(file.originalname))
            }
            else
            {
                


                const uniqueSuffix = Date.now() + "-" + Math.round(Math.random()*1e9);
                const newName = req.body.title.replace(/\s/g, '')
                cb(null, newName + "-" + uniqueSuffix + ".pdf")
            }
        }
        else
        {
            
            const uniqueSuffix = Date.now() + "-" + Math.round(Math.random()*1e9);
            const newName = req.user.username
            cb(null, newName + "-" + uniqueSuffix + path.extname(file.originalname))
        }
    }
    });
const upload = multer({storage: fileStorageEngine, limits: {fileSize: 3000000}})
db.pragma("journal_mode = WAL") //Makes it faster
//npm install nodemon



const app = express()
app.use(express.json())

const linkRegex = /(https?\:\/\/)?(www\.)?[^\s]+\.[^\s]+/g


//mailing function
async function sendEmail(to, subject, html) {
    let transporter = nodemailer.createTransport({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: process.env.MAILNAME,
            pass: process.env.MAILSECRET
        },
        tls: {
            rejectUnauthorized: false
        }
    });


    let info = await transporter.sendMail({
        from: '"Chris Price Music" <info@chrispricemusic.net>',
        to: to,
        subject: subject,
        html: html

    })

}

function replacer(matched) {
    let withProtocol = matched
  
    if(!withProtocol.startsWith("http")) {
      withProtocol = "http://" + matched
    }
  
    const newStr = `<a
      target="_blank"
      href="${withProtocol}"
    >
      ${matched}
    </a>`

    
  
    return newStr
}

const createTables = db.transaction(() => {
    db.prepare(
        `
        CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username STRING NOT NULL UNIQUE,
        firstname STRING NOT NULL,
        lastname STRING NOT NULL,
        schoolorg STRING,
        email STRING NOT NULL UNIQUE,
        password STRING NOT NULL,
        admin BOOL NOT NULL,
        purchaseditems STRING,
        owner BOOL NOT NULL,
        verified BOOL NOT NULL,
        emailsecret STRING NOT NULL,
        img STRING,
        bio STRING,
        newsletter BOOL
        )
        `
    ).run()

    db.prepare(
        `
        CREATE TABLE IF NOT EXISTS music (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        createdDate TEXT,
        title STRING NOT NULL,
        content STRING NOT NULL,
        youtubelink STRING,
        ensembletype STRING,
        cost STRING,
        copyright BOOL NOT NULL,
        headerimage STRING,
        composer STRING,
        arranger STRING,
        difficulty INT NOT NULL,
        instruments STRING,
        sales STRING,
        approved BOOL NOT NULL,
        uploadDate STRING NOT NULL,
        author STRING NOT NULL,
        pdf STRING NOT NULL,
        img STRING NOT NULL
        )
        `
    ).run()

    db.prepare(
        `
        CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title STRING NOT NULL,
        content STRING NOT NULL
        )
        `
    ).run()


    db.prepare(
        `
        CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title STRING NOT NULL,
        content STRING NOT NULL,
        location STRING NOT NULL,
        headerimage STRING
        )
        `
    ).run()

    db.prepare(
        `
        CREATE TABLE IF NOT EXISTS links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        piece INTEGER NOT NULL,
        link STRING NOT NULL,
        user STRING
        )
        `
    ).run()

    db.prepare(
        `
        CREATE TABLE IF NOT EXISTS featured (
        ensembletype STRING PRIMARY KEY,
        piece INT
        )
        `
    ).run()

    const checkFeatured = db.prepare("SELECT COUNT(*) as count FROM featured").get();
    if (checkFeatured.count === 0) {
        db.prepare(`
            INSERT INTO featured (ensembletype)
            VALUES (?), (?), (?), (?), (?), (?), (?), (?), (?), (?), (?)
          `).run(
            "Wind Ensemble/Concert Band",
            "String Ensemble",
            "Marching Band",
            "Jazz Band",
            "Jazz Combo",
            "Full Orchestra",
            "Small Ensemble",
            "Choir",
            "Jazz Choir",
            "Percussion",
            "Solo Piano"
          );
    }

})

createTables();

const fileSizeLimitErrorHandler = (err, req, res, next) => {
    if (err) {
      res.locals.errors.push("File size too large. 3 MB limit")

      next()
    } else {
      next()
    }
  }
  


app.set("view engine", "ejs")
app.set("views", path.join(__dirname, "views"));
//Views is the folder they'll look in

function getVideoId(url){
    var video_id = url.split('v=')[1];
    var ampersandPosition = video_id.indexOf('&');
    if(ampersandPosition != -1) {
    video_id = video_id.substring(0, ampersandPosition);

    return video_id;
}
return video_id
}


app.use(express.urlencoded({extended: false}))// This makes it so we can easily access requests

app.use(express.static("public")) //Using public folder
app.use(cookieParser())
app.use(express.static('/public'));
app.use(body_parser.json())



//Middleware
app.use(function (req, res, next) {
    res.locals.errors = []

    const stmt = db.prepare(`
        SELECT music.*, featured.ensembletype 
        FROM featured 
        INNER JOIN music ON featured.piece = music.id
        WHERE music.ensembletype = 'Marching Band'
    `);
    const marchingMusicFeature = stmt.get();

    const marchingStatement = db.prepare(`SELECT * FROM music WHERE ensembletype = 'Marching Band' and APPROVED = 1 ORDER by uploadDate LIMIT 2`);
    const recentMarching = marchingStatement.all();

    const jazzStatement = db.prepare(`
        SELECT * FROM music
        WHERE ensembletype IN ('Jazz Band', 'Jazz Combo') AND APPROVED = 1
        ORDER BY RANDOM()
        LIMIT 3
      `);
    const recentJazz = jazzStatement.all();

    const concertStatement = db.prepare(`
        SELECT * FROM music
        WHERE ensembletype = 'Wind Ensemble/Concert Band' AND APPROVED = 1
        ORDER BY RANDOM()
        LIMIT 3
      `);
    const recentConcert = concertStatement.all();

    res.locals.marchingMusicFeature = marchingMusicFeature;
    res.locals.recentMarching = recentMarching;
    res.locals.recentJazz = recentJazz;
    res.locals.recentConcert = recentConcert;

    // try to decode incoming cookie
    try {
        const decoded = jwt.verify(req.cookies.cpmLogin, process.env.JWTSECRET)
        req.user = decoded


        const adminStatement = db.prepare("SELECT * FROM users WHERE id = ?")
        req.admin = adminStatement.get(req.user.userid).admin
        req.owner = adminStatement.get(req.user.userid).owner

        if(!adminStatement.get(req.user.userid).verified)
        {
            req.user = false;
            req.admin = false;
            req.owner = false;

            res.locals.errors.push("Please verify your email.")
        }


    } catch(err){
        req.user = false
        req.admin = false
        req.owner = false
    }

    if(typeof req.cookies.cpmCart === "undefined")
    {

        req.shopping_cart = []
    }
    else
    {
        req.shopping_cart = req.cookies.cpmCart;
    }



    res.locals.user = req.user
    res.locals.admin = req.admin
    res.locals.owner = req.owner
    res.locals.shopping_cart = req.shopping_cart;



    console.log(req.user)

    next()
})

//check for login
function mustBeLoggedIn(req, res, next){
    if(req.user) {
        return next()
    }
    else
    {
        return res.redirect("/login")
    }
}

//check for admin
function mustBeAdmin(req, res, next){
    if(req.admin) {
        return next()
    }
    else
    {
        return res.redirect("/")
    }
}

//check for owner
function mustBeOwner(req, res, next){
    if(req.owner) {
        return next()
    }
    else
    {
        return res.redirect("/")
    }
}

function roundToTwo(num) {
    return Math.round((num + Number.EPSILON) * 100) / 100;
}


app.get("/", (req,res) =>{

    const stmt = db.prepare(`
        SELECT music.*, featured.ensembletype 
        FROM featured 
        INNER JOIN music ON featured.piece = music.id
    `);
    const featuredMusic = stmt.all();
    

    
    const newMusicStmt = db.prepare(`SELECT * FROM music WHERE approved = 1 ORDER BY uploadDate LIMIT 6`);
    const newMusic = newMusicStmt.all();

    const pianoStmt = db.prepare(`SELECT * FROM music WHERE ensembletype = ? and approved = 1 ORDER BY uploadDate LIMIT 6`);
    const soloPiano = pianoStmt.all("Solo Piano");

    res.render("homepage", {featuredMusic, newMusic, soloPiano})
})

app.get("/login", (req,res) =>{
    //Showing that we're not registering
    const register = false;

    //If we're logged in, we don't need to be here!
    if(req.user)
    {
        res.redirect("/")
    }

    res.render("login-register",{register})
})

app.get("/register", (req,res) =>{
    //Showing that we are registering
    const register = true;

    //If we're logged in, we don't need to be here!
    if(req.user)
    {
        res.redirect("/")
    }

    res.render("login-register",{register})
})

app.get("/add-music", mustBeAdmin, (req,res) =>{
    res.render("add-music")
})

app.get("/approve/:id", mustBeOwner, (req, res) => {
    const statement = db.prepare("UPDATE music set approved = ? WHERE id = ?")
    statement.run(1,req.params.id)

    const getPieceStatement = db.prepare("SELECT * FROM music WHERE id = ?")
    const piece = getPieceStatement.get(req.params.id)

    const getUserStatement = db.prepare("SELECT * FROM users WHERE username = ?")
    const user = getUserStatement.get(piece.author)

    html =`
    <html>
        <head>
            <title>Check it out!</title>
            <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    vertical-align: baseline;
                    background: transparent;
                    font-family: "Open Sans", sans-serif;
                    font-weight: 400;
                    font-style: normal;
                    line-height: 1.4em;
                    word-wrap: break-word;
                }
                
                :root{

                --background-dark:rgb(0, 0, 0);
                --background-light:rgb(0, 0, 0);
                --color-light: #0d0b0e;
                --color-dark: #211825;
                --color-primary: #b026ff;
                --color-primary-active: #5d00b1;
                --color-secondary: #00d2b8;
                --color-secondary-active: #009784;
                --border-width: 1.5px;
                --color-reverse: #333;
                }

                body{
                    color: var(--color-light);
                }

                i {
                    font-style: italic;
                }


                h1, h2, h3, h4, h5{
                    margin: 12px;
                    font-family: "quicksand", sans-serif;
                    font-weight: 700;
                    font-style: normal;
                }

                a{
                    color: var(--color-light);
                    font-weight: 600;
                }

                a:hover{
                    color: var(--color-primary)
                }
                .card{
                    margin-top: 10px;
                    padding: 12px;
                    background-color: var(--color-primary);
                    box-shadow: 2px 2px 0px var(--color-dark);

                }

                .card a:hover{
                    color: var(--color-primary-active);
                }

                .card small{
                    color: var(--color-light);
                }

                hr{
                    width: 80%;
                    border-color: var(--color-primary)
                }

                .grid{
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                }

                @media only screen and (width<=1000px){
                    .grid{
                        grid-template-columns: 1fr;
                        margin-left: 8px;
                        margin-right: 8px;
                    }
                }

                p{
                    margin: 12px;
                }

            </style>
        </head>
        <header style="text-align: center;">
            <br>
            <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo">
            
        </header>
        <body>
            <h2>Your Piece Has Been Approved!</h2>
            <p>Congratulations ${user.firstname}, your piece ${piece.title}, has been approved!</p>
            <p>Check it out <a href="https://chrispricemusic.net/music/`+req.params.id+`">here!</a></p>
            
        </body>
        <br>
        <hr>
        <footer style="text-align: center;">
            <br>
            <a href="chrispricemusic.net">chrispricemusic.net</a>
            <br>
        </footer>
    </html>
    `

    sendEmail(user.email,"Your Piece Has Been Approved!",html)

    res.redirect(`/music/${req.params.id}`)
})

app.get("/feature", mustBeOwner, (req,res) => {
    var ensembleType = req.query.e
    var pieceId = req.query.id

    const statement = db.prepare("UPDATE featured set piece = ? WHERE ensembletype = ?")
    statement.run(pieceId,ensembleType)

    res.redirect(`/music/${pieceId}`)


})

app.get("/apply" , (req,res) => {
    res.render("apply")
})

app.get("/download/:id", mustBeLoggedIn, (req, res) => {
    const downloadId = req.params.id;
    const statement = db.prepare("SELECT * FROM music WHERE id = ?")
    const piece = statement.get(downloadId);
    let bought = 0;
    if(!req.owner)
    {
        if((req.admin)&&(piece.author == req.user.username))
        {
            return res.download(`./pdf/${piece.pdf}`, `${piece.title}.pdf`)
        }

        
        const userStatement = db.prepare("SELECT * FROM users WHERE id = ?")
        const userInQuestion = userStatement.get(req.user.userid)

        const boughtItems = JSON.parse(userInQuestion.purchaseditems)

        boughtItems.forEach(item => {
            let thisId = (Number(item))
            let checkId = (Number(req.params.id))
            if(thisId == checkId)
            {
                bought = 1;
            }
        })
    }
    else
    {
        return res.download(`./pdf/${piece.pdf}`, `${piece.title}.pdf`)
    }

    //Add script for checking if the user has purchased the piece

    if(bought)
    {
        return res.download(`./pdf/${piece.pdf}`, `${piece.title}.pdf`)
    }
    res.redirect("/")
})

app.get("/img/:id", mustBeLoggedIn, (req, res) => {
    const downloadId = req.params.id;
    const statement = db.prepare("SELECT * FROM music WHERE id = ?")
    const piece = statement.get(downloadId);



    //Add script for checking if the user has purchased the piece


    res.download(`./public/img/${piece.img}`, `${piece.title}.png`)
})

app.get("/edit-users", mustBeOwner, (req, res) => {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.searchUser || ""
    const limit = 10;
    const offset = (page - 1) * limit;
    let usersStmt = null
    let users = null
    let countStmt = null
    let totalUsers = null
    let totalPages = null


    const searchTerm = `%${search}%`;
  
    if(search == "")
    {
        usersStmt = db.prepare("SELECT * FROM users ORDER BY id DESC LIMIT ? OFFSET ?");
        users = usersStmt.all(limit, offset);

        countStmt = db.prepare("SELECT COUNT(*) AS count FROM users");
        totalUsers = countStmt.get().count;
        totalPages = Math.ceil(totalUsers / limit);
    }
    else
    {
        usersStmt = db.prepare("SELECT * FROM users WHERE username like ? or email like ? or firstname like ? or lastname like ? ORDER BY id DESC LIMIT ? OFFSET ?");
        users = usersStmt.all(searchTerm, searchTerm, searchTerm, searchTerm, limit, offset);

        countStmt = db.prepare("SELECT COUNT(*) AS count FROM users WHERE username like ? or email like ? or firstname like ? or lastname like ?");
        totalUsers = countStmt.get(searchTerm, searchTerm, searchTerm, searchTerm).count;
        totalPages = Math.ceil(totalUsers / limit);
    }

  
    res.render("edit-users", {
      users,
      currentPage: page,
      totalPages,
      searchUser: search
    });
});

app.post("/edit-users", mustBeOwner, (req, res) => {
    const page = 1;
    const search = req.body.search_user || ""
  
    res.redirect(`edit-users?page=${page}&searchUser=${search}`);
});


app.get("/sales", mustBeAdmin, (req,res) => {

    let allMusic = []
    let music = null;
    let multiplier = 0.9
    if(req.user)
    {
        const musicStatement = db.prepare("SELECT * FROM music WHERE author = ?")
        music = musicStatement.all(req.user.username)
    }
    else
    {
        res.redirect("/")
    }

    if(req.owner)
    {
        const allMusicStatement = db.prepare("SELECT * FROM music WHERE author != ?")
        allMusic = allMusicStatement.all(req.user.username)

        multiplier = 1;
    }
    date = new Date()

    const dateStart = new Date(date.getFullYear(), date.getMonth(), 1);
    const dateEnd = new Date(date.getFullYear(), date.getMonth() + 1, 1);


    res.render("sales", {music, allMusic, multiplier, dateStart, dateEnd})
})

app.post("/sales",mustBeAdmin,(req, res) => {
    let allMusic = []
    let music = null;
    let multiplier = 0.9
    if(req.user)
    {
        const musicStatement = db.prepare("SELECT * FROM music WHERE author = ?")
        music = musicStatement.all(req.user.username)
    }
    else
    {
        res.redirect("/")
    }

    if(req.owner)
    {
        const allMusicStatement = db.prepare("SELECT * FROM music WHERE author != ?")
        allMusic = allMusicStatement.all(req.user.username)

        multiplier = 1;
    }
    date = new Date()

    const dateStart = req.body.dateStart
    const dateEnd = req.body.dateEnd


    res.render("sales", {music, allMusic, multiplier, dateStart, dateEnd})
})

app.get("/verify/:id", (req,res) => {
    try{
        const statement = db.prepare("SELECT * FROM users WHERE emailsecret = ?")
        const userInQuestion = statement.get(req.params.id);

        const update = db.prepare("UPDATE users set verified = 1 WHERE id = ?")
        update.run(userInQuestion.id)


        // log the user in by giving them a cookie
        const ourTokenValue = jwt.sign({exp: Math.floor(Date.now() / 1000) + (60*60*24), userid: userInQuestion.id, username: userInQuestion.username, name: userInQuestion.firstname}, process.env.JWTSECRET) //Creating a token for logging in

        res.cookie("cpmLogin",ourTokenValue, {
            httpOnly: true,
            secure: true,
            sameSite: "strict",
            maxAge: 1000 * 60 * 60 * 24
        }) //name, string to remember,

        return res.render("verified")
    } catch(err)
    {
        return res.redirect("/")
    }
})


app.get("/unsub/:id", (req,res) => {
    try{
        const statement = db.prepare("SELECT * FROM users WHERE emailsecret = ?")
        const userInQuestion = statement.get(req.params.id);

        const update = db.prepare("UPDATE users set newsletter = 0 WHERE id = ?")
        update.run(userInQuestion.id)


        return res.render("unsub")
    } catch(err)
    {
        return res.redirect("/")
    }
})

app.get("/edit-music", mustBeAdmin, (req,res) => {
    const page = parseInt(req.query.page) || 1;
    const search = req.query.searchMusic || ""
    const limit = 30;
    const offset = (page - 1) * limit;
    let pieces = null
    let usersStmt = null
    let countStmt = null
    let totalUsers = null
    let totalPages = null


    const searchTerm = `%${search}%`;
  
    if(search == "")
    {
        if(!req.owner)
        {
            const statement = db.prepare("SELECT * FROM music WHERE author = ? ORDER BY uploadDate LIMIT ? OFFSET ?")
            pieces = statement.all(req.user.username, limit, offset)

            countStmt = db.prepare("SELECT COUNT(*) AS count FROM music WHERE author = ? ");
            totalUsers = countStmt.get(req.user.username).count;
            totalPages = Math.ceil(totalUsers / limit);
        }
        else
        {
            const statement = db.prepare("SELECT * FROM music ORDER BY uploadDate LIMIT ? OFFSET ?")
            pieces = statement.all( limit, offset)

            countStmt = db.prepare("SELECT COUNT(*) AS count FROM music");
            totalUsers = countStmt.get().count;
            totalPages = Math.ceil(totalUsers / limit);
        }
    }
    else
    {
        if(!req.owner)
            {
                const statement = db.prepare("SELECT * FROM music WHERE author = ? AND (title LIKE ? OR ensembletype LIKE ? OR composer LIKE ?) ORDER BY uploadDate LIMIT ? OFFSET ?")
                pieces = statement.all(req.user.username, searchTerm, searchTerm, searchTerm, limit, offset)

                countStmt = db.prepare("SELECT COUNT(*) AS count FROM music WHERE author = ? AND (title LIKE ? OR ensembletype LIKE ? OR composer LIKE ?)");
                totalUsers = countStmt.get(req.user.username, searchTerm, searchTerm, searchTerm).count;
                totalPages = Math.ceil(totalUsers / limit);
            }
            else
            {
                const statement = db.prepare("SELECT * FROM music WHERE title like ? or ensembletype like ? or composer like ? ORDER BY uploadDate LIMIT ? OFFSET ?")
                pieces = statement.all(searchTerm, searchTerm, searchTerm, limit, offset)

                countStmt = db.prepare("SELECT COUNT(*) AS count FROM music WHERE title like ? or ensembletype like ? or composer like ?");
                totalUsers = countStmt.get(searchTerm, searchTerm, searchTerm).count;
                totalPages = Math.ceil(totalUsers / limit);
            }
    }



    res.render("edit-music",{pieces, currentPage: page,
        totalPages,
        searchMusic: search})
})

app.post("/edit-music", mustBeAdmin, (req, res) => {
    const page = 1;
    const search = req.body.searchMusic || ""
  
    res.redirect(`edit-music?page=${page}&searchMusic=${search}`);
});

app.get("/edit-music/:id", (req,res) => {
    const statement = db.prepare("SELECT * FROM music WHERE id = ?")
    const piece = statement.get(req.params.id)

    if((piece.approved == false) && (req.admin == false))
        {
            return res.redirect("/")
        }
    
        if((piece.approved == false) && (req.user.username !== piece.author))
        {
            if(!req.owner)
            {
                return res.redirect("/")
            }
        }
    
    


    res.render("edit-piece",{piece})
})

app.get("/music/:id", (req,res)=>{
    //select everything from posts (posts.*) then select only username from users (users.username)
    const statement = db.prepare("SELECT * FROM music WHERE id = ?")
    const piece = statement.get(req.params.id)
    
    const statmentForUserId = db.prepare("SELECT * FROM users WHERE username = ?")
    const userForId = statmentForUserId.get(piece.author)
    const authorId = userForId.id

    if(!piece) {
        return res.redirect("/")
    }

    let video_id = ""

    if(piece.youtubelink !=="")
    {
        video_id = getVideoId(piece.youtubelink)
    }
    else
    {
        video_id = "";
    }


    if((piece.approved == false) && (req.admin == false))
    {
        return res.redirect("/")
    }

    if((piece.approved == false) && (req.user.username !== piece.author))
    {
        if(!req.owner)
        {
            return res.redirect("/")
        }
    }

    let download = 0; //0 - Can't download, 1 - Admin or author, 2 - Purchased
    if(req.user)
    {
        if((req.user.username == piece.author) || (req.owner)){
            download = 1;
        }
    }


    let bought = 0;
    if(req.user)
    {
        const userStatement = db.prepare("SELECT * FROM users WHERE id = ?")
        const userInQuestion = userStatement.get(req.user.userid);

        const boughtItems = JSON.parse(userInQuestion.purchaseditems);

        boughtItems.forEach(item =>{
            if(Number(item) == req.params.id)
                bought = 1;
        })
    }

    //Add script about if purchased add download button

    piece.content = piece.content.replace(linkRegex, replacer)

    const instrumentArray = piece.instruments.match(/[^,]+/g);

    res.render("music", {piece,video_id,instrumentArray, download, bought, authorId})
})

app.get("/pay-writers", mustBeOwner, (req,res) => {
    const userStatement = db.prepare("SELECT * FROM users WHERE admin = ?")
    const users = userStatement.all(1)

    const musicStatement = db.prepare("SELECT * FROM music")
    const music = musicStatement.all()

    let monthYear = null

    if(req.query.month)
    {
        monthYear = `${new Date(req.query.month).getMonth() + 2}-${new Date(req.query.month).getFullYear()}`;
    }
    else
    {
        monthYear = `${new Date().getMonth() + 1}-${new Date().getFullYear()}`;
    }

    res.render("pay-writers", {users, music, monthYear})
})

app.get("/profile/:id", (req,res) => {
    const userId = req.params.id
    const getUserStatement = db.prepare("SELECT * FROM users WHERE id = ?")
    const thisUser = getUserStatement.get(userId)
    let myProfile = false

    if(!thisUser)
    {
        return res.redirect("/")
    }

    if(!thisUser.admin)
    {
        return res.redirect("/")
    }

    if(thisUser.id == req.user.userid)
    {
        myProfile = true
    }

    const musicStatement = db.prepare("SELECT * FROM music WHERE author = ? and approved = 1 ORDER BY uploadDate LIMIT ?")
    music = musicStatement.all(thisUser.username, 6)

    res.render("profile",{thisUser,myProfile,music})
})

app.post("/update-bio/:id", mustBeAdmin, (req,res) => {
    if(req.user.userid == req.params.id)
    {
        const updateStatement = db.prepare("UPDATE users set bio = ? WHERE id = ?")
        updateStatement.run(req.body.bio,req.user.userid)
    }
    else
    {
        return res.redirect("/")
    }

    res.redirect(`/profile/${req.user.userid}`)
})

app.post("/update-image/:id", mustBeAdmin, upload.fields([{ name: 'image', maxCount: 1 }]), fileSizeLimitErrorHandler, (req,res) => {

    const errors = res.locals.errors;


    if(errors.length) {
        return res.redirect(`/profile/${req.user.userid}`) //returning to the login page while also passing the object "errors"
    }

    const imgUrl = req.files.image[0].filename
    if(req.user.userid == req.params.id)
    {
        const updateStatement = db.prepare("UPDATE users set img = ? WHERE id = ?")
        updateStatement.run(imgUrl,req.user.userid)
    }
    else
    {
        return res.redirect("/")
    }

    res.redirect(`/profile/${req.user.userid}`)
})

app.post("/pay", async(req,res) =>{


    let email = req.body.email

    if(req.user)
    {
        const statement = db.prepare("SELECT * FROM users WHERE username = ?")
        const userInQuestion = statement.get(req.user.username);

        email = userInQuestion.email;
    }

    let items = [];

    req.shopping_cart.forEach(item => {
        items.push({
            name: item.title,
            description: item.title + "for" + item.ensemble,
            quantity: 1,
            unit_amount: {
                currency_code: "USD",
                value: item.cost.toFixed(2)
            }
        })
    })

    try
    {
        /*const testItems = [
            {
                name: 'Node.js Complete Course',
                description: 'Node.js complete course with express and MongoDB',
                quantity: 1,
                unit_amount: {
                    currency_code: 'USD',
                    value: '100.00'
                }
            },
            {
                name: 'Node.js Complete Course',
                description: 'Node.js complete course with express and MongoDB',
                quantity: 1,
                unit_amount: {
                    currency_code: 'USD',
                    value: '100.00'
                },
            }
        ]*/

            if(!req.user)
            {
                const userId = Math.floor(Date.now() / 1000);
            }
            else
            {
                const userId = req.user.userid;
            }

            const shopping_cart = req.shopping_cart
            const ourTokenValue = jwt.sign({exp: Math.floor(Date.now() / 1000) + (60*60*24), items: {shopping_cart}, userid: req.user.userid, email:email}, process.env.JWTSECRET) //Creating a token for logging in

            res.cookie("cpmBuy",ourTokenValue, {
                httpOnly: true,
                secure: true,
                sameSite: "strict",
                maxAge: 1000 * 60 * 60 * 24
            }) //name, string to remember,

        const url = await paypal.createOrder(items)

        res.redirect(url)
    }
    catch (error) {
        res.send("No transaction was made. error: "+error)
    }


})

app.get("/itemdownload/:id", (req,res) => {
    const statement = db.prepare("SELECT * FROM links WHERE link = ?")
    const link = statement.get(req.params.id);

    if(!link)
    {
        return res.redirect("/")
    }

    const musicStatment = db.prepare("SELECT * FROM music where id = ?")
    const piece = musicStatment.get(link.piece);

    if(!piece)
    {
        return res.redirect("/")
    }


    if(link.user)
    {
        if(!req.user)
        {
            let errors = ["You must be logged in"]
            let register = 0;
            return res.render("login-register",{errors,register})
        }
        else
        {
            if(req.user.username != link.user)
            {
                return res.redirect("/")
            }
        }
    }


    return res.download(`./pdf/${piece.pdf}`, `${piece.title}.pdf`)

})

app.get("/art", mustBeAdmin, (req,res) => {
    res.render("cover-art")
})

app.get("/send-email", mustBeOwner, (req,res) => {
    res.render("send-email")
})

app.post("/send-email", mustBeOwner, (req,res) => {

    const getAllUsers = db.prepare("SELECT * FROM users WHERE newsletter = 1")
    const users = getAllUsers.all()

    let emailSecret = ""

    if(req.body.test == "Send Test")
    {
        html =`
    <html>
        <head>
            <title>Check it out!</title>
            <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    vertical-align: baseline;
                    background: transparent;
                    font-family: "Open Sans", sans-serif;
                    font-weight: 400;
                    font-style: normal;
                    line-height: 1.4em;
                    word-wrap: break-word;
                }
                
                :root{

                --background-dark:rgb(0, 0, 0);
                --background-light:rgb(0, 0, 0);
                --color-light: #0d0b0e;
                --color-dark: #211825;
                --color-primary: #b026ff;
                --color-primary-active: #5d00b1;
                --color-secondary: #00d2b8;
                --color-secondary-active: #009784;
                --border-width: 1.5px;
                --color-reverse: #333;
                }

                body{
                    color: var(--color-light);
                }

                i {
                    font-style: italic;
                }


                h1, h2, h3, h4, h5{
                    margin: 12px;
                    font-family: "quicksand", sans-serif;
                    font-weight: 700;
                    font-style: normal;
                }

                a{
                    color: var(--color-light);
                    font-weight: 600;
                }

                a:hover{
                    color: var(--color-primary)
                }
                .card{
                    margin-top: 10px;
                    padding: 12px;
                    background-color: var(--color-primary);
                    box-shadow: 2px 2px 0px var(--color-dark);

                }

                .card a:hover{
                    color: var(--color-primary-active);
                }

                .card small{
                    color: var(--color-light);
                }

                hr{
                    width: 80%;
                    border-color: var(--color-primary)
                }

                .grid{
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                }

                @media only screen and (width<=1000px){
                    .grid{
                        grid-template-columns: 1fr;
                        margin-left: 8px;
                        margin-right: 8px;
                    }
                }

                p{
                    margin: 12px;
                }

            </style>
        </head>
        <header style="text-align: center;">
            <br>
            <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo">
            
        </header>
        <body>
            ${req.body.content}
        </body>
        <br>
        <hr>
        <footer style="text-align: center;">
            <br>
            <a href="chrispricemusic.net/unsub/${emailSecret}">Unsubscribe from emails</a>
            <br>
            <br>
            <a href="chrispricemusic.net">chrispricemusic.net</a>
            <br>
        </footer>
    </html>
    `
    sendEmail("chrisprice5614@gmail.com",req.body.subject,html)

    }
    else
    {
        users.forEach(user => {

        let salt = bcrypt.genSaltSync(10)
        let newEmailSecret = bcrypt.hashSync(req.body.email + Date.now().toString(), salt).replace(/[^a-zA-Z0-9]/g, '')
        db.prepare(`UPDATE users SET emailsecret = ? WHERE email = ?`).run(newEmailSecret, user.email);
        html =`
        <html>
            <head>
                <title>Check it out!</title>
                <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
                <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
                <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                        margin: 0;
                        padding: 0;
                        border: 0;
                        outline: 0;
                        vertical-align: baseline;
                        background: transparent;
                        font-family: "Open Sans", sans-serif;
                        font-weight: 400;
                        font-style: normal;
                        line-height: 1.4em;
                        word-wrap: break-word;
                    }
                    
                    :root{

                    --background-dark:rgb(0, 0, 0);
                    --background-light:rgb(0, 0, 0);
                    --color-light: #0d0b0e;
                    --color-dark: #211825;
                    --color-primary: #b026ff;
                    --color-primary-active: #5d00b1;
                    --color-secondary: #00d2b8;
                    --color-secondary-active: #009784;
                    --border-width: 1.5px;
                    --color-reverse: #333;
                    }

                    body{
                        color: var(--color-light);
                    }

                    i {
                        font-style: italic;
                    }


                    h1, h2, h3, h4, h5{
                        margin: 12px;
                        font-family: "quicksand", sans-serif;
                        font-weight: 700;
                        font-style: normal;
                    }

                    a{
                        color: var(--color-light);
                        font-weight: 600;
                    }

                    a:hover{
                        color: var(--color-primary)
                    }
                    .card{
                        margin-top: 10px;
                        padding: 12px;
                        background-color: var(--color-primary);
                        box-shadow: 2px 2px 0px var(--color-dark);

                    }

                    .card a:hover{
                        color: var(--color-primary-active);
                    }

                    .card small{
                        color: var(--color-light);
                    }

                    hr{
                        width: 80%;
                        border-color: var(--color-primary)
                    }

                    .grid{
                        display: grid;
                        grid-template-columns: 1fr 1fr 1fr;
                    }

                    @media only screen and (width<=1000px){
                        .grid{
                            grid-template-columns: 1fr;
                            margin-left: 8px;
                            margin-right: 8px;
                        }
                    }

                    p{
                        margin: 12px;
                    }

                </style>
            </head>
            <header style="text-align: center;">
                <br>
                <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo">
                
            </header>
            <body>
                ${req.body.content}
            </body>
            <br>
            <hr>
            <footer style="text-align: center;">
                <br>
                <a href="chrispricemusic.net/unsub/${newEmailSecret}">Unsubscribe from emails</a>
                <br>
                <br>
                <a href="chrispricemusic.net">chrispricemusic.net</a>
                <br>
            </footer>
        </html>
        `

        sendEmail(user.email,req.body.subject,html)})
    }

    
})

app.get("/forgot-password", (req, res) => {
    if(req.user)
    {
        return res.redirect("/")
    }

    if(typeof errors == "undefined")
    {
        errors = [];
    }
    res.render("forgot-password", {errors})
})

app.get("/reset-password/:id", (req,res) => {

    const emailSecret = req.params.id

    let move = null;

    const statement = db.prepare("SELECT * FROM users")
    const users = statement.all()

    users.forEach(user => {
        let compare = bcrypt.compareSync(emailSecret, user.emailsecret )

        if(compare)
        {
            move = user;
        }
    })

    if(!move)
    {
        return res.redirect("/")
    }
    let errors = [];

    

    res.render("reset-password", {move , emailSecret, errors})
})

app.post("/reset-password", (req,res) => {
    let move = null;
    let errors = []

    const emailSecret = req.body.emailkey

    const statement = db.prepare("SELECT * FROM users")
    const users = statement.all()

    users.forEach(user => {
        let compare = bcrypt.compareSync(emailSecret, user.emailsecret )

        if(compare)
        {
            move = user;
        }
    })

    if(move)
    {
        if(req.body.password == req.body.confirm)
        {

            if(req.body.password && req.body.password.length < 3) errors.push("Your password must have at least 3 characters")
            if(req.body.password && req.body.password.length > 20) errors.push("Your password can have max 20 characters")

            if(errors.length > 0){
                return res.render("reset-password", (move, emailSecret, errors))
            }

            const salt = bcrypt.genSaltSync(10)
            req.body.password = bcrypt.hashSync(req.body.password, salt)

            const updateStatement = db.prepare("UPDATE users set password = ? WHERE username = ?")
            updateStatement.run(req.body.password, move.username)

            //Success!!
            let register = 0;
            errors = ["Password has been reset!"]
            return res.render("login-register", {register, errors})
        }
        else
        {
            errors = ["Passwords do not match"];

            return res.render("reset-password", {move, emailSecret, errors})
        }
    }
    else
    {
        return res.redirect("/")
    }
})

app.post("/forgot-password", (req,res) => {

    let errors = [];

    const statement = db.prepare("SELECT * FROM users WHERE email = ?")
    const userInQuestion = statement.get(req.body.email)

    if(!userInQuestion)
    {
        errors = ["Email does not exist"]
        return res.render("forgot-password",{errors})
    }

    const salt = bcrypt.genSaltSync(10)

    const emailsecret = bcrypt.hashSync(req.body.email + Date.now().toString(), salt).replace(/[^a-zA-Z0-9]/g, '')
    const emailSuperSecret = bcrypt.hashSync(emailsecret, salt);

    const updateStatement = db.prepare("UPDATE users set emailsecret = ? where email = ?")
    updateStatement.run(emailSuperSecret, req.body.email)

    html =`
    <html>
        <head>
            <title>Check it out!</title>
            <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    vertical-align: baseline;
                    background: transparent;
                    font-family: "Open Sans", sans-serif;
                    font-weight: 400;
                    font-style: normal;
                    line-height: 1.4em;
                    word-wrap: break-word;
                }
                
                :root{

                --background-dark:rgb(0, 0, 0);
                --background-light:rgb(0, 0, 0);
                --color-light: #0d0b0e;
                --color-dark: #211825;
                --color-primary: #b026ff;
                --color-primary-active: #5d00b1;
                --color-secondary: #00d2b8;
                --color-secondary-active: #009784;
                --border-width: 1.5px;
                --color-reverse: #333;
                }

                body{
                    color: var(--color-light);
                }

                i {
                    font-style: italic;
                }


                h1, h2, h3, h4, h5{
                    margin: 12px;
                    font-family: "quicksand", sans-serif;
                    font-weight: 700;
                    font-style: normal;
                }

                a{
                    color: var(--color-light);
                    font-weight: 600;
                }

                a:hover{
                    color: var(--color-primary)
                }
                .card{
                    margin-top: 10px;
                    padding: 12px;
                    background-color: var(--color-primary);
                    box-shadow: 2px 2px 0px var(--color-dark);

                }

                .card a:hover{
                    color: var(--color-primary-active);
                }

                .card small{
                    color: var(--color-light);
                }

                hr{
                    width: 80%;
                    border-color: var(--color-primary)
                }

                .grid{
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                }

                @media only screen and (width<=1000px){
                    .grid{
                        grid-template-columns: 1fr;
                        margin-left: 8px;
                        margin-right: 8px;
                    }
                }

                p{
                    margin: 12px;
                }

            </style>
        </head>
        <header style="text-align: center;">
            <br>
            <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo">
            
        </header>
        <body>
            <h2>Reset Password</h2>
            Click here to reset password: <a href="https://chrispricemusic.net/reset-password/`+ emailsecret +`">https://chrispricemusic.net/reset-password/`+ emailsecret +` </a>
            <p>If you did not try to reset your password please ignore this email.</p>
        </body>
        <br>
        <hr>
        <footer style="text-align: center;">
            <br>
            <a href="chrispricemusic.net">chrispricemusic.net</a>
            <br>
        </footer>
    </html>
    `

    sendEmail(req.body.email,"Reset Password",html)

    const passEmail = req.body.email
    res.render("check-email", {passEmail})
})

app.get("/contact", (req,res) => {
    res.render("contact")
})

app.post("/contact", (req,res) => {
    const email = req.body.email;
    const subject = req.body.subject;
    const content = req.body.content;

    html =`
    <html>
        <head>
            <title>Check it out!</title>
            <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    vertical-align: baseline;
                    background: transparent;
                    font-family: "Open Sans", sans-serif;
                    font-weight: 400;
                    font-style: normal;
                    line-height: 1.4em;
                    word-wrap: break-word;
                }
                
                :root{

                --background-dark:rgb(0, 0, 0);
                --background-light:rgb(0, 0, 0);
                --color-light: #0d0b0e;
                --color-dark: #211825;
                --color-primary: #b026ff;
                --color-primary-active: #5d00b1;
                --color-secondary: #00d2b8;
                --color-secondary-active: #009784;
                --border-width: 1.5px;
                --color-reverse: #333;
                }

                body{
                    color: var(--color-light);
                }

                i {
                    font-style: italic;
                }


                h1, h2, h3, h4, h5{
                    margin: 12px;
                    font-family: "quicksand", sans-serif;
                    font-weight: 700;
                    font-style: normal;
                }

                a{
                    color: var(--color-light);
                    font-weight: 600;
                }

                a:hover{
                    color: var(--color-primary)
                }
                .card{
                    margin-top: 10px;
                    padding: 12px;
                    background-color: var(--color-primary);
                    box-shadow: 2px 2px 0px var(--color-dark);

                }

                .card a:hover{
                    color: var(--color-primary-active);
                }

                .card small{
                    color: var(--color-light);
                }

                hr{
                    width: 80%;
                    border-color: var(--color-primary)
                }

                .grid{
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                }

                @media only screen and (width<=1000px){
                    .grid{
                        grid-template-columns: 1fr;
                        margin-left: 8px;
                        margin-right: 8px;
                    }
                }

                p{
                    margin: 12px;
                }
            </style>
        </head>
        <header style="text-align: center;">
            <br>
            <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo" >
            
        </header>
        <body>
            <h2>${subject}</h2>
            <p>You received an email from <a href="mailto:${email}">${email}</p>
            <p>${content}</p>
        </body>
        <br>
        <hr>
        <footer style="text-align: center;">
            <br>
            <a href="chrispricemusic.net">chrispricemusic.net</a>
            <br>
        </footer>
    </html>
    `


    sendEmail("chrisprice5614@gmail.com","CONTACT FORM SUBMISSION",html)

    res.render("message-sent")
})

app.post("/commission", (req,res) => {
    const email = req.body.email;
    const name = req.body.name;
    const ensemble = req.body.ensemble;
    const ensembletype = req.body.ensembletype;
    const budget = req.body.budget
    const content = req.body.content;

    const toEmail = db.prepare("SELECT * FROM users WHERE id = ? and admin = 1").get(req.body.toemail).email

    html =`
    <html>
        <head>
            <title>Check it out!</title>
            <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    vertical-align: baseline;
                    background: transparent;
                    font-family: "Open Sans", sans-serif;
                    font-weight: 400;
                    font-style: normal;
                    line-height: 1.4em;
                    word-wrap: break-word;
                }
                
                :root{

                --background-dark:rgb(0, 0, 0);
                --background-light:rgb(0, 0, 0);
                --color-light: #0d0b0e;
                --color-dark: #211825;
                --color-primary: #b026ff;
                --color-primary-active: #5d00b1;
                --color-secondary: #00d2b8;
                --color-secondary-active: #009784;
                --border-width: 1.5px;
                --color-reverse: #333;
                }

                body{
                    color: var(--color-light);
                }

                i {
                    font-style: italic;
                }


                h1, h2, h3, h4, h5{
                    margin: 12px;
                    font-family: "quicksand", sans-serif;
                    font-weight: 700;
                    font-style: normal;
                }

                a{
                    color: var(--color-light);
                    font-weight: 600;
                }

                a:hover{
                    color: var(--color-primary)
                }
                .card{
                    margin-top: 10px;
                    padding: 12px;
                    background-color: var(--color-primary);
                    box-shadow: 2px 2px 0px var(--color-dark);

                }

                .card a:hover{
                    color: var(--color-primary-active);
                }

                .card small{
                    color: var(--color-light);
                }

                hr{
                    width: 80%;
                    border-color: var(--color-primary)
                }

                .grid{
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                }

                @media only screen and (width<=1000px){
                    .grid{
                        grid-template-columns: 1fr;
                        margin-left: 8px;
                        margin-right: 8px;
                    }
                }

                p{
                    margin: 12px;
                }
            </style>
        </head>
        <header style="text-align: center;">
            <br>
            <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo" >
            
        </header>
        <body>
            <h2>You Just Received a Comission!</h2>
            <p>${name} like's your work so much that they sent you a commission!</p>
            <p>At Chris Price Music, we put the musicians first, including yourself. You are not required to pay a percentage to Chris Price Music with this or any other commission submited from chrispricemusic.net</p>
            <p>Here's what their commission entails:</p>
            <h2>Their name</h2>
            <p>${name}</p>
            <h2>Their ensemble</h2>
            <p>${ensemble}</p>
            <h2>Their ensemble type</h2>
            <p>${ensembletype}</p>
            <h2>Their budget</h2>
            <p>${budget}</p>
            <h2>Commission details</h2>
            <p>${content}</p>
            <p>Please respond to ${name} by emailing them here: <a href="mailto:${email}">${email}</a></p>
        </body>
        <br>
        <hr>
        <footer style="text-align: center;">
            <br>
            <a href="chrispricemusic.net">chrispricemusic.net</a>
            <br>
        </footer>
    </html>
    `


    sendEmail(toEmail,`🎉 You've Got a Commission from ${name} 🎉`,html)

    res.render("message-sent")
})

app.post("/apply", (req,res) => {
    const email = req.body.email;
    const name = req.body.name;
    const content = req.body.content;
    const link = req.body.portfolio

    html =`
    <html>
        <head>
            <title>Check it out!</title>
            <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    vertical-align: baseline;
                    background: transparent;
                    font-family: "Open Sans", sans-serif;
                    font-weight: 400;
                    font-style: normal;
                    line-height: 1.4em;
                    word-wrap: break-word;
                }
                
                :root{

                --background-dark:rgb(0, 0, 0);
                --background-light:rgb(0, 0, 0);
                --color-light: #0d0b0e;
                --color-dark: #211825;
                --color-primary: #b026ff;
                --color-primary-active: #5d00b1;
                --color-secondary: #00d2b8;
                --color-secondary-active: #009784;
                --border-width: 1.5px;
                --color-reverse: #333;
                }

                body{
                    color: var(--color-light);
                }

                i {
                    font-style: italic;
                }


                h1, h2, h3, h4, h5{
                    margin: 12px;
                    font-family: "quicksand", sans-serif;
                    font-weight: 700;
                    font-style: normal;
                }

                a{
                    color: var(--color-light);
                    font-weight: 600;
                }

                a:hover{
                    color: var(--color-primary)
                }
                .card{
                    margin-top: 10px;
                    padding: 12px;
                    background-color: var(--color-primary);
                    box-shadow: 2px 2px 0px var(--color-dark);

                }

                .card a:hover{
                    color: var(--color-primary-active);
                }

                .card small{
                    color: var(--color-light);
                }

                hr{
                    width: 80%;
                    border-color: var(--color-primary)
                }

                .grid{
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                }

                @media only screen and (width<=1000px){
                    .grid{
                        grid-template-columns: 1fr;
                        margin-left: 8px;
                        margin-right: 8px;
                    }
                }

                p{
                    margin: 12px;
                }
            </style>
        </head>
        <header style="text-align: center;">
            <br>
            <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo" >
            
        </header>
        <body>
            <h2>New Application!</h2>
            <p>You received an application from <a href="mailto:${email}">${email}</p>
            <p>Link to portfolio: <a href="${link}">${link}</a></p>
            <p>${content}</p>
        </body>
        <br>
        <hr>
        <footer style="text-align: center;">
            <br>
            <a href="chrispricemusic.net">chrispricemusic.net</a>
            <br>
        </footer>
    </html>
    `


    sendEmail("chrisprice5614@gmail.com","⚠️NEW APPLICATION⚠️",html)

    res.render("message-sent")
})

//Music catalogue
app.get("/music", (req,res) => {
    const searchPiece = req.query.searchPiece || '';
const searchEnsemble = req.query.searchEnsemble || 'Any Ensemble';
const searchGrade = req.query.searchGrade || 'Any Grade';
const searchOrder = req.query.searchOrder || 'Date New - Old';
const page = parseInt(req.query.page) || 1;

const limit = 24;
const offset = (page - 1) * limit;

// Build WHERE clauses
let conditions = [];
let values = [];

// Title, composer, or arranger must match searchPiece
if (searchPiece) {
  conditions.push(`(title LIKE ? OR composer LIKE ? OR arranger LIKE ?)`);
  const searchQuery = `%${searchPiece}%`;
  values.push(searchQuery, searchQuery, searchQuery);
}

// Ensemble filter
if (searchEnsemble !== 'Any Ensemble') {
  conditions.push(`ensembletype = ?`);
  values.push(searchEnsemble);
}

// Grade filter
if (searchGrade !== 'Any Grade') {
  conditions.push(`difficulty = ?`);
  values.push(searchGrade);
}

// Sort logic
let orderBy = 'uploadDate DESC'; // default
switch (searchOrder) {
    case 'Date New - Old':
    orderBy = 'uploadDate ASC';
    break;
  case 'Date Old - New':
    orderBy = 'uploadDate DESC';
    break;
  case 'Title A - Z':
    orderBy = 'title COLLATE NOCASE ASC';
    break;
  case 'Title Z - A':
    orderBy = 'title COLLATE NOCASE DESC';
    break;
  case 'Composer A - Z':
    orderBy = 'composer COLLATE NOCASE ASC';
    break;
  case 'Composer Z - A':
    orderBy = 'composer COLLATE NOCASE DESC';
    break;
  case 'Random':
    orderBy = 'RANDOM()';
    break;
}

// Final SQL statement
const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
const musicSQL = `SELECT * FROM music ${whereClause} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;

const countSQL = `SELECT COUNT(*) AS count FROM music ${whereClause}`;

// Execute queries
const musicStatement = db.prepare(musicSQL);
const pieces = musicStatement.all(...values, limit, offset);

const countStmt = db.prepare(countSQL);
const totalPieces = countStmt.get(...values).count;
const totalPages = Math.ceil(totalPieces / limit);



    res.render("all-music", {pieces, currentPage: page, totalPages, searchPiece,searchEnsemble,searchGrade, searchOrder})
})

app.post("/create-checkout-session", async (req,res) => {
    try{
        let items = [];
        var num = Number(req.shopping_cart[0].cost.toFixed(2));

        const email = req.body.stripeemail;

 

        req.shopping_cart.map(item => {
            items.push ( {
                
                price_data: {
                    currency: "usd",
                    unit_amount: (num*100),
                    product_data: {
                        name: item.title
                    },
                },
                quantity: 1
            })
        })

            const shopping_cart = req.shopping_cart
            const ourTokenValue = jwt.sign({exp: Math.floor(Date.now() / 1000) + (60*60*24), items: {shopping_cart}, userid: req.user.userid, email:email}, process.env.JWTSECRET) //Creating a token for logging in

            res.cookie("cpmBuy",ourTokenValue, {
                httpOnly: true,
                secure: true,
                sameSite: "strict",
                maxAge: 1000 * 60 * 60 * 24
            }) //name, string to remember,


            const session = await stripe.checkout.sessions.create({
            payment_method_types: ["card"],
            mode: 'payment',
            line_items: items,

            success_url: process.env.PAYPAL_REDIRECT_BASE_URL+"/bouncebabyyy",
            cancel_url: process.env.PAYPAL_REDIRECT_BASE_URL+"/cancel-order"
        })


        res.redirect(303, session.url)

    } catch (e) {
        res.status(500).json({ error: e.message })
    }
})

app.get("/grades" , (req,res) => {
    res.render("grades")
})

app.get("/finished-order", (req, res) => {

    let links = [];


    const decoded = jwt.verify(req.cookies.cpmBuy, process.env.JWTSECRET)

    let userLink = "";

    let email=decoded.email;

    let htmlinject = ``
    let purchases = [];

    let userInQuestion = null



    if(req.user)
    {
        const statement = db.prepare("SELECT * FROM users WHERE id = ?")
        userInQuestion = statement.get(decoded.userid);

        userLink = userInQuestion.username;
        email = userInQuestion.email;

        htmlinject = `<p>Because you have an account with us, your library is always available at <a href="https://chrispricemusic.net/purchases">https://chrispricemusic.net/purchases</a></p>`

        

        purchases = userInQuestion.purchaseditems;

        if((purchases == null) || (purchases == "[]"))
        {
            purchases = [];

        }
        else
        {
            purchases = JSON.parse(purchases);
        }
    }

    const salt = bcrypt.genSaltSync(10)

    


    
    decoded.items.shopping_cart.forEach( item => {

        if(req.user)
        {
            purchases.push(item.id)
        }

        //Updating sales
        let salesStatement = db.prepare("SELECT * FROM music WHERE id = ?")
        let pieceToUpdate = salesStatement.get(Number(item.id))

        let sales = pieceToUpdate.sales;

        if(sales == null)
        {
            sales = []
        }
        else
        {
            sales = JSON.parse(sales);
        }

        sales.push(Date.now())

        let updateStatement = db.prepare("UPDATE music set sales = ? WHERE id = ?")
        updateStatement.run(JSON.stringify(sales), pieceToUpdate.id)

        
        let linksecret = bcrypt.hashSync(item.title + Date.now().toString(), salt).replace(/[^a-zA-Z0-9]/g, '')

        //Creating links
        let linkStatement = db.prepare("INSERT into links (piece, link, user) VALUES (? , ? , ?)")
        linkStatement.run(item.id, linksecret,userLink)

        let sendTitle = pieceToUpdate.title
        let sendCost = item.cost

        links.push({url: linksecret,title: sendTitle,cost: sendCost})

        htmlinject+=`<h3> `+ sendTitle +`</h3>`+`<p> $`+ sendCost +`</p><p>Download here: <a href="https://chrispricemusic.net/itemdownload/`+ linksecret +`"></a>https://chrispricemusic.net/itemdownload/`+ linksecret +`</p>`

    })

    if(req.user)
    {
        purchases = JSON.stringify(purchases);

        const updateStatement = db.prepare("UPDATE users set purchaseditems = ? WHERE id = ?")
        updateStatement.run(purchases, userInQuestion.id)
    }



    html =`
    <html>
        <head>
            <title>Check it out!</title>
            <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    vertical-align: baseline;
                    background: transparent;
                    font-family: "Open Sans", sans-serif;
                    font-weight: 400;
                    font-style: normal;
                    line-height: 1.4em;
                    word-wrap: break-word;
                }
                
                :root{

                --background-dark:rgb(0, 0, 0);
                --background-light:rgb(0, 0, 0);
                --color-light: #0d0b0e;
                --color-dark: #211825;
                --color-primary: #b026ff;
                --color-primary-active: #5d00b1;
                --color-secondary: #00d2b8;
                --color-secondary-active: #009784;
                --border-width: 1.5px;
                --color-reverse: #333;
                }

                body{
                    color: var(--color-light);
                }

                i {
                    font-style: italic;
                }


                h1, h2, h3, h4, h5{
                    margin: 12px;
                    font-family: "quicksand", sans-serif;
                    font-weight: 700;
                    font-style: normal;
                }

                a{
                    color: var(--color-light);
                    font-weight: 600;
                }

                a:hover{
                    color: var(--color-primary)
                }
                .card{
                    margin-top: 10px;
                    padding: 12px;
                    background-color: var(--color-primary);
                    box-shadow: 2px 2px 0px var(--color-dark);

                }

                .card a:hover{
                    color: var(--color-primary-active);
                }

                .card small{
                    color: var(--color-light);
                }

                hr{
                    width: 80%;
                    border-color: var(--color-primary)
                }

                .grid{
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                }

                @media only screen and (width<=1000px){
                    .grid{
                        grid-template-columns: 1fr;
                        margin-left: 8px;
                        margin-right: 8px;
                    }
                }

                p{
                    margin: 12px;
                }
            </style>
        </head>
        <header style="text-align: center;">
            <br>
            <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo" >
            
        </header>
        <body>
            <h2>Thank You For Your Purchase!</h2>
            `+htmlinject+`
            <h2>Please do not lose this email!</h2>
            <p>To ensure all purchases are secure, please save these links to your device.</p>
        </body>
        <br>
        <hr>
        <footer style="text-align: center;">
            <br>
            <a href="chrispricemusic.net">chrispricemusic.net</a>
            <br>
        </footer>
    </html>
    `

    sendEmail(email,"Thank You For Your Purchase!",html)



    
    res.clearCookie("cpmBuy")
    res.clearCookie("cpmCart")

    if(req.user)
    {
       return res.redirect("/purchases")
    }
    else
    {
        return res.render("thank-you",{links})
    }
})

app.get("/about" , (req,res) => {
    const getUserStatement = db.prepare("SELECT * FROM users WHERE admin = 1")
    const writers = getUserStatement.all()

    res.render("about", {writers})
})



app.get("/purchases", mustBeLoggedIn, (req,res) => {

    const page = parseInt(req.query.page) || 1;
    const getUserStatement = db.prepare("SELECT * FROM users WHERE id = ?")
    const userInQuestion = getUserStatement.get(req.user.userid);

    let pieceids = []

    pieceids = JSON.parse(userInQuestion.purchaseditems)

    const searchPiece = req.query.searchPiece || ''
    const searchEnsemble = req.query.searchEnsemble || "Any Ensemble"
    const limit = 12;
    const offset = (page - 1) * limit;
    let pieces = []
    let countStmt = null
    let totalPieces = null
    let totalPages = null

    const placeholders = pieceids.map(() => '?').join(',');
    let sql = null
    const searchQuery = `%${searchPiece}%`


    if((searchEnsemble == "Any Ensemble")
    &&(searchPiece == ""))
    {
        sql = `SELECT * FROM music WHERE id IN (${placeholders}) ORDER BY id DESC LIMIT ? OFFSET ?`;

        let pieceStatement = db.prepare(sql)
        pieces = pieceStatement.all( pieceids, limit, offset)

        countStmt = db.prepare(`SELECT COUNT(*) AS count FROM music WHERE id IN (${placeholders})`);
        totalPieces = countStmt.get(pieceids).count;
        totalPages = Math.ceil(totalPieces / limit);
    }
    else
    {
        if(searchEnsemble != "Any Ensemble")
        {

            let pieceStatement = db.prepare(`SELECT * FROM music WHERE id IN (${placeholders}) AND ensembletype= ? AND (title LIKE ? OR ensembletype LIKE ? OR composer LIKE ? or arranger LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`)
            pieces = pieceStatement.all( pieceids, searchEnsemble, searchQuery, searchQuery, searchQuery, searchQuery, limit, offset)

            countStmt = db.prepare(`SELECT COUNT(*) AS count FROM music WHERE id IN (${placeholders}) AND ensembletype = ?  AND (title LIKE ? OR ensembletype LIKE ? OR composer LIKE ? or arranger LIKE ?)`);
            totalPieces = countStmt.get(pieceids,searchEnsemble, searchQuery, searchQuery, searchQuery, searchQuery).count;
            totalPages = Math.ceil(totalPieces / limit);
        }
        else
        {

            let pieceStatement = db.prepare(`SELECT * FROM music WHERE id IN (${placeholders}) AND (title LIKE ? OR ensembletype LIKE ? OR composer LIKE ? or arranger LIKE ?) ORDER BY id DESC LIMIT ? OFFSET ?`)
            pieces = pieceStatement.all( pieceids,  searchQuery, searchQuery, searchQuery, searchQuery, limit, offset)

            countStmt = db.prepare(`SELECT COUNT(*) AS count FROM music WHERE id IN (${placeholders}) AND (title LIKE ? OR ensembletype LIKE ? OR composer LIKE ? or arranger LIKE ?)`);
            totalPieces = countStmt.get(pieceids, searchQuery, searchQuery, searchQuery, searchQuery).count;
            totalPages = Math.ceil(totalPieces / limit);
        }
    }


    if(typeof pieces === "undefined")
    {
        pieces = []
    }

    res.render("purchases",{pieces, currentPage: page, totalPages, searchPiece, searchEnsemble})
})

app.post("/purchases", mustBeLoggedIn, (req,res) => {
    const searchPiece = req.body.title
    const searchEnsemble = req.body.ensemble

    res.redirect(`/purchases?searchPiece=${searchPiece}&searchEnsemble=${searchEnsemble}`)
})

app.get("/complete-order",async(req,res) =>{
    try
    {
        await paypal.capturePayment(req.query.token)

        
        const sentUrl = "/finished-order"
        return res.render("order-bounce",{sentUrl})
    }
    catch(error)
    {
        res.send("What the hellll Error: "+error)
    }

    res.get("Complete Order")
})

app.get("/bouncebabyyy", async(req, res) => {
    const sentUrl = "/finished-order"
    return res.render("order-bounce",{sentUrl})
})

app.get("/cancel-order",(req,res) =>{
    res.redirect("/checkout")
})

app.get("/logout", (req,res) => {
    res.clearCookie("cpmLogin")
    res.redirect("/")
})

app.get("/cart", (req,res) => {
    res.render("cart")
})

app.get("/checkout", (req, res) => {
    res.render("checkout")
})


app.post("/add-cart/:id", (req, res) => {

    const statement = db.prepare("SELECT * FROM music WHERE id = ?")
    const piece = statement.get(req.params.id)

    req.shopping_cart[req.shopping_cart.length] = { id: req.params.id, subcost: Number(piece.cost), cost: roundToTwo(Number(piece.cost)*1.04), title: piece.title, ensemble: piece.ensembletype, img: piece.img}

    res.cookie("cpmCart",req.shopping_cart, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 72
    }) 

    res.redirect(`/music/${req.params.id}`)
})

app.post("/remove-cart/:id", (req, res) => {

    req.shopping_cart.splice(req.params.id,1)

    res.cookie("cpmCart",req.shopping_cart, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 72
    }) 

    res.redirect("/cart")
})

//Registering
app.post("/register", (req, res) =>{
    
    const errors = []

    if(typeof req.body.newsletter === "undefined")
        {
            req.body.newsletter = 0;
        }
        else
        {
            req.body.newsletter = 1;
        }


    if (typeof req.body.username !== "string") req.body.username = ""
    if (typeof req.body.password !== "string") req.body.password = ""
    if (typeof req.body.firstname !== "string") req.body.firstname = ""
    if (typeof req.body.lastname !== "string") req.body.lastname = ""
    if (typeof req.body.email !== "string") req.body.email = ""

    req.body.username = req.body.username.trim()
    req.body.firstname = req.body.firstname.trim()
    req.body.lastname = req.body.lastname.trim()
    req.body.email = req.body.email.trim().toLowerCase()
    req.body.schoolorg = req.body.schoolorg.trim()

    if(!req.body.username) errors.push("You must provide a username.")
    if(req.body.username && req.body.username.length < 3) errors.push("Your username must have at least 3 characters")
    if(req.body.username && req.body.username.length > 20) errors.push("Your username can have max 20 characters")
    if(req.body.username && !req.body.username.match(/^[a-zA-Z0-9]+$/)) errors.push("Username can only contain letters and numbers.")

    if(!req.body.password) errors.push("You must provide a password.")
    if(req.body.password && req.body.password.length < 6) errors.push("Your password must have at least 3 characters")
    if(req.body.password && req.body.password.length > 20) errors.push("Your password can have max 10 characters")

    if(!req.body.firstname) errors.push("You must provide a first name.")
    if(!req.body.lastname) errors.push("You must provide a last name.")
    if(!req.body.email) errors.push("You must provide an email.")

    //Check if username exists
    const usernameStatement = db.prepare("SELECT * FROM users WHERE username = ?")
    const usernameCheck = usernameStatement.get(req.body.username)

    //Check if email exists
    const emailStatement = db.prepare("SELECT * FROM users WHERE email = ?")
    const emailCheck = emailStatement.get(req.body.email)

    if(usernameCheck) errors.push("Username is already taken.")
    if(emailCheck) errors.push("Email is already taken.")

    if(errors.length > 0)
    {
        const register = true;
        //if there's an error, we return to the homepage and let them know there's an issue
        return res.render("login-register", {errors,register})
    }

    
    
    // Save the new user into a database
    const salt = bcrypt.genSaltSync(10)
    req.body.password = bcrypt.hashSync(req.body.password, salt)

    const emailsecret = bcrypt.hashSync(req.body.username + Date.now().toString(), salt).replace(/[^a-zA-Z0-9]/g, '')

    const ourStatement = db.prepare("INSERT INTO users (username, password, firstname, lastname, email, admin, schoolorg, owner, verified, emailsecret, purchaseditems, newsletter) VALUES (? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ?)")
    const result = ourStatement.run(req.body.username, req.body.password, req.body.firstname, req.body.lastname, req.body.email, 0, req.body.schoolorg, 0 ,0, emailsecret, "[]", req.body.newsletter)

    const lookupStatement = db.prepare("SELECT * FROM users WHERE ROWID = ?")
    const ourUser = lookupStatement.get(result.lastInsertRowid)

    

    const html = `
        <html>
        <head>
            <title>Check it out!</title>
            <link rel="icon" type="image/x-icon" href="https://www.dropbox.com/scl/fi/cvyp68qqihaakktohzyt8/favicon.ico?dl=1">
            <link href="https://fonts.googleapis.com/css2?family=Open+Sans:ital,wght@0,300..800;1,300..800&family=Oswald:wght@200..700&display=swap" rel="stylesheet">
            <link rel="stylesheet" href="https://use.typekit.net/ayz5zyc.css">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                html, body, div, span, applet, object, iframe, h1, h2, h3, h4, h5, h6, p, blockquote, pre, a, abbr, acronym, address, big, cite, code, del, dfn, em, font, img, ins, kbd, q, s, samp, small, strike, strong, sub, sup, tt, var, b, u, i, center, dl, dt, dd, ol, ul, li, fieldset, form, label, legend, caption {
                    margin: 0;
                    padding: 0;
                    border: 0;
                    outline: 0;
                    vertical-align: baseline;
                    background: transparent;
                    font-family: "Open Sans", sans-serif;
                    font-weight: 400;
                    font-style: normal;
                    line-height: 1.4em;
                    word-wrap: break-word;
                }
                
                :root{

                --background-dark:rgb(0, 0, 0);
                --background-light:rgb(0, 0, 0);
                --color-light: #0d0b0e;
                --color-dark: #211825;
                --color-primary: #b026ff;
                --color-primary-active: #5d00b1;
                --color-secondary: #00d2b8;
                --color-secondary-active: #009784;
                --border-width: 1.5px;
                --color-reverse: #333;
                }

                body{
                    color: var(--color-light);
                }

                i {
                    font-style: italic;
                }


                h1, h2, h3, h4, h5{
                    margin: 12px;
                    font-family: "quicksand", sans-serif;
                    font-weight: 700;
                    font-style: normal;
                }

                a{
                    color: var(--color-light);
                    font-weight: 600;
                }

                a:hover{
                    color: var(--color-primary)
                }
                .card{
                    margin-top: 10px;
                    padding: 12px;
                    background-color: var(--color-primary);
                    box-shadow: 2px 2px 0px var(--color-dark);

                }

                .card a:hover{
                    color: var(--color-primary-active);
                }

                .card small{
                    color: var(--color-light);
                }

                hr{
                    width: 80%;
                    border-color: var(--color-primary)
                }

                .grid{
                    display: grid;
                    grid-template-columns: 1fr 1fr 1fr;
                }

                @media only screen and (width<=1000px){
                    .grid{
                        grid-template-columns: 1fr;
                        margin-left: 8px;
                        margin-right: 8px;
                    }
                }

                p{
                    margin: 12px;
                }
            </style>
        </head>
        <header style="text-align: center;">
            <br>
            <img src="https://raw.githubusercontent.com/chrisprice5614/Form-Test/refs/heads/main/logoBlack.png" alt="Chris price music logo" >
            
        </header>
        <body>
            <h2>Verify Email</h2>
            <p>Click here to verify email: <a href="https://chrispricemusic.net/verify/`+ emailsecret +`">https://chrispricemusic.net/verify/`+ emailsecret +`</a></p>
        </body>
        <br>
        <hr>
        <footer style="text-align: center;">
            <br>
            <a href="chrispricemusic.net">chrispricemusic.net</a>
            <br>
        </footer>
    </html>
    `

    sendEmail(req.body.email,"Verify Email",html)

    const passEmail = req.body.email;

    res.render("check-email", {passEmail})
    
})


app.post("/add-music", mustBeAdmin, upload.fields([{
    name: 'file', maxCount: 1
  }, {
    name: 'image', maxCount: 1,
    fieldSize: 6
  }]), fileSizeLimitErrorHandler, (req, res) =>{
    
    const errors = res.locals.errors;

    if(errors.length) {
        return res.render(`add-music`, {errors}) //returning to the login page while also passing the object "errors"
    }

    req.body.title = req.body.title.trim()
    req.body.content = req.body.content.trim()
    req.body.youtube = req.body.youtube.trim()
    req.body.composer = req.body.composer.trim()
    req.body.arranger = req.body.arranger.trim()
    req.body.instruments = req.body.instruments.trim()

    
    const pdfUrl = req.files.file[0].filename
    const imgUrl = req.files.image[0].filename
    

    if(typeof req.body.copyright === "undefined")
    {
        req.body.copyright = 0;
    }
    else
    {
        req.body.copyright = 1;
    }

    const decoded = jwt.verify(req.cookies.cpmLogin, process.env.JWTSECRET)
    req.user = decoded

    const thisDate = new Date().toISOString();

    const ourStatement = db.prepare("INSERT INTO music (title, content, youtubelink, ensembletype, cost, composer, arranger, difficulty, instruments, copyright, createdDate, approved, uploadDate, author, pdf, img) VALUES (? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? , ? )")
    const result = ourStatement.run(req.body.title, req.body.content, req.body.youtube, req.body.ensemble, req.body.cost, req.body.composer, req.body.arranger, req.body.difficulty, req.body.instruments, req.body.copyright, req.body.createdDate, 0, thisDate, req.user.username, pdfUrl, imgUrl)

    const lookupStatement = db.prepare("SELECT * FROM music WHERE ROWID = ?")
    const ourPiece = lookupStatement.get(result.lastInsertRowid)


    res.redirect(`/music/${ourPiece.id}`)
    
})


app.post("/update-music/:id", mustBeAdmin, upload.fields([{
    name: 'file', maxCount: 1
  }, {
    name: 'image', maxCount: 1,
    fieldSize: 6
  }]), fileSizeLimitErrorHandler, (req, res) =>{
    
    const errors = res.locals.errors;

    const statement = db.prepare("SELECT * FROM music WHERE id = ?")
    const piece = statement.get(req.params.id)

    if(errors.length) {
        return res.render(`edit-piece`, {errors, piece}) //returning to the login page while also passing the object "errors"
    }

    req.body.title = req.body.title.trim()
    req.body.content = req.body.content.trim()
    req.body.youtube = req.body.youtube.trim()
    req.body.composer = req.body.composer.trim()
    req.body.arranger = req.body.arranger.trim()
    req.body.instruments = req.body.instruments.trim()

    const pdfUrl = req.files.file[0].filename
    const imgUrl = req.files.image[0].filename


    if(typeof req.body.copyright === "undefined")
    {
        req.body.copyright = 0;
    }
    else
    {
        req.body.copyright = 1;
    }

    

    const filePath = __dirname+'/pdf/' + piece.pdf;
    
    fs.unlink(filePath, (err) => {
        if (err) {
          console.error('Error deleting the file:', err);
          return;
        }

      });

      const imgPath = __dirname+'/public/img/' + piece.img
      fs.unlink(imgPath, (err) => {
        if (err) {
          console.error('Error deleting the file:', err);
          return;
        }

      });

    if(!piece) {
        return res.redirect("/")
    }

    const decoded = jwt.verify(req.cookies.cpmLogin, process.env.JWTSECRET)
    req.user = decoded

    const thisDate = new Date().toString();

    const ourStatement = db.prepare("UPDATE music set title = ?, content = ?, youtubelink = ?, ensembletype = ?, cost = ?, composer = ?, arranger = ?, difficulty = ?, instruments = ?, copyright = ?, approved = ?, uploadDate = ?, pdf = ?, img = ? WHERE id = ?")
    const result = ourStatement.run(req.body.title, req.body.content, req.body.youtube, req.body.ensemble, req.body.cost, req.body.composer, req.body.arranger, req.body.difficulty, req.body.instruments, req.body.copyright, 0, thisDate, pdfUrl, imgUrl, req.params.id)

    const lookupStatement = db.prepare("SELECT * FROM music WHERE ROWID = ?")
    const ourPiece = lookupStatement.get(req.params.id)


    res.redirect(`/music/${ourPiece.id}`)
    
})


app.post("/make-admin", mustBeOwner, (req,res) => {


    const getUserStatement = db.prepare("SELECT * FROM users WHERE username = ?")
    const user = getUserStatement.get(req.body.username)

    const isAdmin = !Number(user.admin)

    const changeUserStatement = db.prepare("UPDATE users set admin = ? WHERE username = ?")
    changeUserStatement.run(Number(isAdmin), req.body.username)
    

    res.json({ success: true, admin: isAdmin, change: 0 });
})

app.post("/make-owner", mustBeOwner, (req,res) => {


    const getUserStatement = db.prepare("SELECT * FROM users WHERE username = ?")
    const user = getUserStatement.get(req.body.username)

    const isOwner = !Number(user.owner)

    const changeUserStatement = db.prepare("UPDATE users set owner = ? WHERE username = ?")
    changeUserStatement.run(Number(isOwner), req.body.username)

    res.json({ success: true, admin: isOwner, change: 1 });
})

app.post("/delete-user", mustBeOwner, (req,res) => {


    const getUserStatement = db.prepare("DELETE FROM users WHERE username = ?")
    getUserStatement.run(req.body.username)

    res.redirect("edit-users")
})

//logging in
app.post("/login", (req, res) => {

    const register = false;

    let errors = []

    

    if (typeof req.body.email !== "string") req.body.email = ""
    if (typeof req.body.password !== "string") req.body.password = ""

    req.body.email = req.body.email.trim().toLowerCase()

    if(req.body.email == "") errors=["Invalid email/password"]
    if(req.body.password == "") errors=["Invalid email/password"]

    if(errors.length) {
        return res.render("login-register", {errors, register}) //returning to the login page while also passing the object "errors"
    }

    const userInQuestionStatement = db.prepare("SELECT * FROM users WHERE EMAIL = ?") //Select *(any) from 'name of table'
    const userInQuestion = userInQuestionStatement.get(req.body.email)

    if(!userInQuestion) {
         errors=["Invalid email/password"]
         return res.render("login-register", {errors ,register})
    }


    const matchOrNot = bcrypt.compareSync(req.body.password, userInQuestion.password)
    if(!matchOrNot)
    {
        errors=["Invalid email/password"]
        return res.render("login-register", {errors ,register})
    }

    if(!userInQuestion.verified){
        errors=["Please verify your email."]
        return res.render("login-register", {errors ,register})
    }
    // log the user in by giving them a cookie
    const ourTokenValue = jwt.sign({exp: Math.floor(Date.now() / 1000) + (60*60*24), userid: userInQuestion.id, username: userInQuestion.username, name: userInQuestion.firstname}, process.env.JWTSECRET) //Creating a token for logging in

    res.cookie("cpmLogin",ourTokenValue, {
        httpOnly: true,
        secure: true,
        sameSite: "strict",
        maxAge: 1000 * 60 * 60 * 24
    }) //name, string to remember,

    

    //redirection
    res.redirect("/")
})

app.post("/test", (req,res) => {
    res.json({msg: "Hello"})
})

app.use((req, res, next) => {
    res.status(404).render('404'); // render the 404.ejs page
});


//What port we're listening on
app.listen(3006)


////npm run dev
//Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
//Set-ExecutionPolicy Unrestricted -Scope CurrentUser
//npm init -y This will add the stuff in package.json
//Put this in package.json under scripts : "dev": "nodemon server",