Add-Type -AssemblyName System.Drawing

function New-PluginIcon {
    param(
        [int]$Size,
        [string]$OutPath
    )

    $bmp = New-Object System.Drawing.Bitmap($Size, $Size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

    # 透明背景
    $g.Clear([System.Drawing.Color]::Transparent)

    # 绘制圆角蓝色背景
    $rect = New-Object System.Drawing.Rectangle(0, 0, $Size, $Size)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect,
        [System.Drawing.Color]::FromArgb(255, 37, 99, 235),
        [System.Drawing.Color]::FromArgb(255, 29, 78, 216),
        45
    )

    $radius = [int]($Size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $path.AddArc(0, 0, $radius * 2, $radius * 2, 180, 90)
    $path.AddArc($Size - $radius * 2, 0, $radius * 2, $radius * 2, 270, 90)
    $path.AddArc($Size - $radius * 2, $Size - $radius * 2, $radius * 2, $radius * 2, 0, 90)
    $path.AddArc(0, $Size - $radius * 2, $radius * 2, $radius * 2, 90, 90)
    $path.CloseFigure()

    $g.FillPath($brush, $path)

    # 绘制白色文档形状
    $docMargin = [int]($Size * 0.22)
    $docW = $Size - $docMargin * 2
    $docH = [int]($docW * 1.15)
    $docX = $docMargin
    $docY = [int](($Size - $docH) / 2)
    if ($docY -lt $docMargin) { $docY = $docMargin }
    if ($docY + $docH -gt $Size - $docMargin) { $docH = $Size - $docMargin - $docY }

    $whiteBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
    $cornerCut = [int]($docW * 0.25)

    $docPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $docPath.AddLines(@(
        (New-Object System.Drawing.Point($docX, $docY)),
        (New-Object System.Drawing.Point(($docX + $docW - $cornerCut), $docY)),
        (New-Object System.Drawing.Point(($docX + $docW), ($docY + $cornerCut))),
        (New-Object System.Drawing.Point(($docX + $docW), ($docY + $docH))),
        (New-Object System.Drawing.Point($docX, ($docY + $docH)))
    ))
    $docPath.CloseFigure()
    $g.FillPath($whiteBrush, $docPath)

    # 绘制文档线条（横线）
    if ($Size -ge 32) {
        $linePen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 37, 99, 235), [Math]::Max(1, [int]($Size * 0.04)))
        $lineCount = 3
        $lineGap = [int]($docH * 0.18)
        $lineStartY = $docY + [int]($docH * 0.42)
        for ($i = 0; $i -lt $lineCount; $i++) {
            $y = $lineStartY + $i * $lineGap
            $lineW = if ($i -eq $lineCount - 1) { [int]($docW * 0.5) } else { [int]($docW * 0.7) }
            $lineX1 = $docX + [int]($docW * 0.15)
            $lineX2 = $lineX1 + $lineW
            $g.DrawLine($linePen, $lineX1, $y, $lineX2, $y)
        }
        $linePen.Dispose()
    }

    # 保存 PNG
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

    # 清理
    $g.Dispose()
    $bmp.Dispose()
    $brush.Dispose()
    $whiteBrush.Dispose()
    $path.Dispose()
    $docPath.Dispose()

    Write-Host "✓ Generated $OutPath ($Size x $Size)"
}

$iconDir = "C:\Users\haiyanhuang\smart-print-pdf\icons"
New-PluginIcon -Size 16  -OutPath "$iconDir\icon16.png"
New-PluginIcon -Size 32  -OutPath "$iconDir\icon32.png"
New-PluginIcon -Size 48  -OutPath "$iconDir\icon48.png"
New-PluginIcon -Size 128 -OutPath "$iconDir\icon128.png"

Write-Host ""
Write-Host "All icons generated successfully:"
Get-ChildItem $iconDir | Format-Table Name, Length
