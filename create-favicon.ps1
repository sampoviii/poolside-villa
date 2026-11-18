# PowerShell script to create a square favicon from the logo
# This creates a 32x32 pixel square icon with the logo centered

Add-Type -AssemblyName System.Drawing

$sourcePath = "c:\xampp\htdocs\poolside-vista.page.gd\assets\images\logo.png"
$destPath = "c:\xampp\htdocs\poolside-vista.page.gd\assets\images\favicon.png"

# Load the original logo
$originalImage = [System.Drawing.Image]::FromFile($sourcePath)

# Create a 32x32 square bitmap
$size = 32
$favicon = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($favicon)

# Set high quality rendering
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

# Fill with transparent background
$graphics.Clear([System.Drawing.Color]::Transparent)

# Calculate dimensions to fit the logo proportionally within 32x32
$aspectRatio = $originalImage.Width / $originalImage.Height
$destWidth = $size
$destHeight = [int]($size / $aspectRatio)

# If height is too tall, adjust based on height instead
if ($destHeight -gt $size) {
    $destHeight = $size
    $destWidth = [int]($size * $aspectRatio)
}

# Center the image
$x = [int](($size - $destWidth) / 2)
$y = [int](($size - $destHeight) / 2)

# Draw the logo
$destRect = New-Object System.Drawing.Rectangle($x, $y, $destWidth, $destHeight)
$graphics.DrawImage($originalImage, $destRect)

# Save the favicon
$favicon.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)

# Clean up
$graphics.Dispose()
$favicon.Dispose()
$originalImage.Dispose()

Write-Host "Favicon created successfully at: $destPath"
Write-Host "Size: 32x32 pixels"
