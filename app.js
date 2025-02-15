const express = require('express');
const { google } = require('googleapis');
const app = express();
const port = process.env.PORT || 3000; // Correct way to define the port
//const port = process.env.GOOGLE_APPLICATION_CREDENTIALS || 3000;
const path = require("path");
// const serviceAccountKey = require("./public/attend.json")
let fetch;
  //Use dynamic import to fix error
import('node-fetch').then((module) => {
    fetch = module.default;
});
  //Middleware
app.use(express.static('public'));
app.use(express.json());
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});
 // Set up Google Sheets API client
 const sheets = google.sheets({version: 'v4'});
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
//  const SPREADSHEET_ID = '1pySIWHFMb30sjMIMkL0XUJdVx_P1RSPAtwHbfh3_fFI'; // Replace with your actual Spreadsheet ID
 // Authentication
 const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
//  const auth = new google.auth.GoogleAuth({
//  credentials: serviceAccountKey,
//  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
//  });
 async function getSheetData() {
 try {
 const sheetData = await sheets.spreadsheets.values.get({
 auth,
 spreadsheetId: SPREADSHEET_ID,
 range: 'A1:Z'
 });
 return sheetData.data.values;
 } catch (error) {
 console.error('Error getting sheet data', error);
 throw new Error('Error getting sheet data: ' + error.message)
 }
 }
 async function updateSheetData(data) {
 try {
 await sheets.spreadsheets.values.append({
 auth,
 spreadsheetId: SPREADSHEET_ID,
 range: 'A1:Z',
 valueInputOption: 'USER_ENTERED',
 resource: { values: [data] }
 });
 } catch (error) {
 console.error('Error updating sheet data', error);
 throw new Error('Error updating sheet data:'+ error.message)
 }
 }
 async function updateSheetRow(range, data) {
 try{
 await sheets.spreadsheets.values.update({
 auth,
 spreadsheetId: SPREADSHEET_ID,
 range: range,
 valueInputOption: 'USER_ENTERED',
 resource:{ values: [data] }
 })
 } catch (error) {
 console.error('Error updating sheet data', error);
 throw new Error('Error updating sheet data:'+ error.message)
 }
 }
 // API endpoints
 app.post('/punch-in', async (req, res) => {
 const { employeeId, fullName, tasks } = req.body;
 try {
 // Get time and date
 const now = new Date();
 const date = now.toLocaleDateString();
 const punchInTime = now.toLocaleTimeString();
 const sheetData = await getSheetData();
 // Check if the employeeId already exists.
 const existingUser = sheetData.some(row => row[0] === employeeId && row[2] === date);
 if(existingUser){
 return res.json({ success: false, message: 'User already punched in.' });
 }
 await updateSheetData([employeeId,fullName,date, punchInTime, "", tasks]);
 return res.json({success: true, message: "Punch In Successful"});
 } catch (error) {
 console.error("Error during punch in.", error);
 return res.status(500).json({success: false, message: "Error during punch in. "+ error.message})
 }
 });
 app.post("/punch-out", async (req, res) => {
 const { employeeId, fullName, tasks } = req.body;
 
 try {
 // Get time and date
 const now = new Date();
 const punchOutTime = now.toLocaleTimeString();
 const sheetData = await getSheetData();
 // Check if the employeeId exists in the sheet
 const userIndex = sheetData.findIndex(row => row[0] === employeeId);
 if (userIndex === -1) {
 return res.status(400).json({ success: false, message: "User not logged in." });
 }
 if (sheetData[userIndex][4]) {
 return res.status(400).json({ success: false, message: "User has already punched out." });
 }
 const punchInTime = sheetData[userIndex][3];
 //Calculate total hour
 const totalHours = calculateHoursWorked(punchInTime, punchOutTime);
 await updateSheetRow(`A${userIndex + 1}:Z${userIndex+1}`, [sheetData[userIndex][0], sheetData[userIndex][1], sheetData[userIndex][2], sheetData[userIndex][3], punchOutTime, sheetData[userIndex][5], totalHours]);
 return res.json({success: true, message: "Punch out succesful.", totalHours});
 } catch (error) {
 console.error("Error during punch out.", error);
 return res.status(500).json({ success: false, message: "Error during punch out. "+ error.message });
 }
 });
 function calculateHoursWorked(punchInTime, punchOutTime) {
     if (!punchInTime || !punchOutTime) {
         return '00:00:00 hours';
     }
 
     let formattedPunchOutTime = punchOutTime;
     if(formattedPunchOutTime.toLowerCase().includes('pm')){
          const [time, modifier] = formattedPunchOutTime.split(" ");
         let [hours, minutes, seconds] = time.split(":").map(Number);
          if(hours !== 12){
             hours = hours+ 12;
         }
        formattedPunchOutTime = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
 
     }else if(formattedPunchOutTime.toLowerCase().includes('am')){
           const [time, modifier] = formattedPunchOutTime.split(" ");
        let [hours, minutes, seconds] = time.split(":").map(Number);
           if(hours === 12){
               hours = 0;
           }
             formattedPunchOutTime = `${String(hours).padStart(2,'0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
     }
 
     const timeRegex = /^(\d{1,2}):(\d{2}):(\d{2})$/;
     const inMatch = String(punchInTime).match(timeRegex);
     const outMatch = String(formattedPunchOutTime).match(timeRegex);
 
    if (!inMatch || !outMatch) {
          return '00:00:00 hours';
     }
    const inHours = Number(inMatch[1]);
     const inMinutes = Number(inMatch[2]);
     const inSeconds = Number(inMatch[3]);
      const outHours = Number(outMatch[1]);
      const outMinutes = Number(outMatch[2]);
     const outSeconds = Number(outMatch[3]);
 
     const inTimeInSeconds = inHours * 3600 + inMinutes * 60 + inSeconds;
     const outTimeInSeconds = outHours * 3600 + outMinutes * 60 + outSeconds;
 
    const diffInSeconds = outTimeInSeconds - inTimeInSeconds;
     if (diffInSeconds <= 0) {
            return '00:00:00 hours';
        }
 
    const diffHours = Math.floor(diffInSeconds / 3600);
    const diffMinutes = Math.floor((diffInSeconds % 3600) / 60);
    const diffSeconds = diffInSeconds % 60;
 
     const formattedHours = String(diffHours).padStart(2, '0');
    const formattedMinutes = String(diffMinutes).padStart(2, '0');
     const formattedSeconds = String(diffSeconds).padStart(2, '0');
 
     return `${formattedHours}:${formattedMinutes}:${formattedSeconds} hours`;
 }
//Handle 404 error
  app.get('*', (req, res) => {
      res.status(404).send("Not found");
  });
 app.listen(port, () => {
      console.log(`Server is running on port ${port}`);
  });
