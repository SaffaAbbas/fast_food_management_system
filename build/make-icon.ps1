Add-Type -AssemblyName System.Drawing
$path = Join-Path $PSScriptRoot 'icon.png'
$bmp = New-Object System.Drawing.Bitmap 256, 256
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(255, 234, 88, 12))
$fontFamily = [System.Drawing.FontFamily]::GenericSansSerif
$font = New-Object System.Drawing.Font($fontFamily, 88, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
$sf = New-Object System.Drawing.StringFormat
$sf.Alignment = [System.Drawing.StringAlignment]::Center
$sf.LineAlignment = [System.Drawing.StringAlignment]::Center
$rect = New-Object System.Drawing.RectangleF(0, 10, 256, 256)
$g.DrawString('RF', $font, $brush, $rect, $sf)
$bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
$font.Dispose()
$brush.Dispose()
$g.Dispose()
$bmp.Dispose()
Write-Output $path
