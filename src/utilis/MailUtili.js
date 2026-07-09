const mailer = require('nodemailer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const transporter = mailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
    }
});

const renderTemplate = (htmlFile, replacements = {}) => {
    const htmlpath = path.join(__dirname, '../Templates', htmlFile);
    let htmlContent = fs.readFileSync(htmlpath, 'utf-8');
    
    for (let key in replacements) {
        if (replacements[key] !== undefined) {
            htmlContent = htmlContent.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
        }
    }

    return htmlContent;
};

const sendMail = async (to, subject, htmlFile, replacements = {}) => {
    const htmlContent = renderTemplate(htmlFile, replacements);
    const mailOptions = {
        from: process.env.EMAIL_USER,
        to: to,
        subject: subject,
        html: htmlContent
    };

    const mailResponse = await transporter.sendMail(mailOptions);
    return mailResponse;
};

sendMail.renderTemplate = renderTemplate;

module.exports = sendMail;
