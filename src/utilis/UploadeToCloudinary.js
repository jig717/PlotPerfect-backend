const cloudinary = require("./Cloudinaryutili"); 
const streamifier = require("streamifier");

const CLOUDINARY_UPLOAD_TIMEOUT_MS = 30000;

const uploadToCloudinary = (buffer) => {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Cloudinary upload timed out. Please check Cloudinary credentials/network or try a smaller image."));
    }, CLOUDINARY_UPLOAD_TIMEOUT_MS);

    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: "Backend1" },
      (error, result) => {
        clearTimeout(timeout);
        if (error) {
          reject(error);
          return;
        }
        resolve(result);
      }
    );

    uploadStream.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

module.exports = uploadToCloudinary;
