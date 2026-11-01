$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
$sourceDocument = Join-Path $projectRoot "image assets\CloverLoop_Content_and_SEO_Master_Document.docx"
$resourceDirectory = Join-Path $projectRoot "content\resources"

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::OpenRead($sourceDocument)
try {
    $documentEntry = $archive.GetEntry("word/document.xml")
    $reader = [System.IO.StreamReader]::new($documentEntry.Open())
    try { [xml]$document = $reader.ReadToEnd() } finally { $reader.Dispose() }
} finally {
    $archive.Dispose()
}

$namespace = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
$namespace.AddNamespace("w", "http://schemas.openxmlformats.org/wordprocessingml/2006/main")
$paragraphs = foreach ($paragraph in $document.SelectNodes("//w:body//w:p", $namespace)) {
    $text = ($paragraph.SelectNodes(".//w:t", $namespace) | ForEach-Object { $_.InnerText }) -join ""
    if (-not $text.Trim()) { continue }
    $styleNode = $paragraph.SelectSingleNode("./w:pPr/w:pStyle", $namespace)
    [PSCustomObject]@{
        Text = $text.Trim()
        Style = if ($styleNode) { $styleNode.GetAttribute("val", $namespace.LookupNamespace("w")) } else { "" }
    }
}

$resourceMetadata = @(
    @{
        slug = "how-to-write-an-ebook"
        title = "How to Write an Ebook: A Practical Guide from Idea to Finished Product"
        seoTitle = "How to Write an Ebook: Beginner's Guide"
        description = "Learn how to plan, write, edit, design and publish an ebook, from choosing a useful topic to preparing a polished downloadable PDF."
        keyword = "how to write an ebook"
        image = "how-to-write-an-ebook"
        related = @("how-to-sell-ebooks", "digital-products", "content-creator")
    },
    @{
        slug = "how-to-sell-ebooks"
        title = "How to Sell Ebooks Online: From Product Listing to Customer Delivery"
        seoTitle = "How to Sell Ebooks Online"
        description = "Learn how to package, price, present and promote ebooks online, and create a clear buying and download experience for customers."
        keyword = "how to sell ebooks online"
        image = "how-to-sell-ebooks"
        related = @("how-to-write-an-ebook", "marketing-ideas-tool", "digital-products")
    },
    @{
        slug = "how-to-sell-presets"
        title = "How to Sell Presets Online: A Guide for Photography, Video and Music Creators"
        seoTitle = "How to Sell Presets Online"
        description = "Learn how to create, test, package, price and market photography, video and music presets as downloadable digital products."
        keyword = "how to sell presets online"
        image = "how-to-sell-presets"
        related = @("digital-products", "how-to-sell-ebooks", "marketing-ideas-tool")
    },
    @{
        slug = "how-to-sell-printables"
        title = "How to Sell Printables Online: Create Useful Downloadable Resources"
        seoTitle = "How to Sell Printables Online"
        description = "Discover how to research, design, test, package and market printable planners, worksheets, trackers and downloadable resources."
        keyword = "how to sell printables online"
        image = "how-to-sell-printables"
        related = @("how-to-sell-canva-templates", "digital-products", "marketing-ideas-tool")
    },
    @{
        slug = "how-to-sell-canva-templates"
        title = "How to Sell Canva Templates Online: Design, Package and Promote"
        seoTitle = "How to Sell Canva Templates Online"
        description = "Learn how to create, package, price and market Canva templates, with practical guidance on licensing, customer access and previews."
        keyword = "how to sell Canva templates online"
        image = "how-to-sell-canva-templates"
        related = @("how-to-sell-printables", "digital-products", "how-to-write-an-ebook")
    },
    @{
        slug = "online-course-ideas"
        title = "50 Online Course Ideas for Creators: Find a Topic People Want to Learn"
        seoTitle = "50 Online Course Ideas for Creators"
        description = "Explore 50 online course ideas across music, business, finance, design and technology, plus a framework for validating your teaching topic."
        keyword = "online course ideas"
        image = "online-course-ideas"
        related = @("content-creator", "digital-products", "how-to-write-an-ebook")
    },
    @{
        slug = "content-creator"
        title = "Content Creator: Building a Business Beyond Social Media"
        seoTitle = "Content Creator: Building a Business Beyond Social Media"
        description = "Learn how content creators can turn their expertise and audience into digital products, build a direct storefront and develop additional revenue opportunities."
        keyword = "content creator business"
        image = "content-creator"
        related = @("digital-products", "marketing-ideas-tool", "online-course-ideas", "how-to-sell-ebooks")
    },
    @{
        slug = "digital-products"
        title = "Digital Products: A Practical Guide to Creating and Selling Online"
        seoTitle = "Digital Products: A Guide to Creating and Selling"
        description = "Explore digital product types, ideas and examples, then learn how to validate, create, price, present and sell downloadable products online."
        keyword = "digital products"
        image = "digital-products"
        related = @("how-to-write-an-ebook", "how-to-sell-ebooks", "how-to-sell-presets", "how-to-sell-printables", "how-to-sell-canva-templates", "content-creator")
    }
)

$articleStarts = @{}
foreach ($metadata in $resourceMetadata) {
    $articleStarts[$metadata.title] = $metadata
}

New-Item -ItemType Directory -Force -Path $resourceDirectory | Out-Null
$written = [System.Collections.Generic.HashSet[string]]::new()
for ($index = 0; $index -lt $paragraphs.Count; $index++) {
    $metadata = $articleStarts[$paragraphs[$index].Text]
    if (-not $metadata -or $paragraphs[$index].Style -ne "Heading1") { continue }

    $bodyStarted = $false
    $blocks = [System.Collections.Generic.List[object]]::new()
    for ($cursor = $index + 1; $cursor -lt $paragraphs.Count; $cursor++) {
        $entry = $paragraphs[$cursor]
        if ($entry.Text -eq "Article copy") { $bodyStarted = $true; continue }
        if ($bodyStarted -and $entry.Text -eq "Related resources and internal links") { break }
        if (-not $bodyStarted) { continue }

        $text = $entry.Text
        $style = $entry.Style
        $kind = if ($style -match "^Heading[2-6]$" -or $text -match "^\d+\.\s+\S" -and $text.Length -lt 110 -and $text -notmatch "\.\s+\d+\.") { "heading" } else { "paragraph" }
        if ($text -match "^Key takeaway\s+") {
            $blocks.Add(@{ type = "takeaway"; text = ($text -replace "^Key takeaway\s+", "") })
        } else {
            $blocks.Add(@{ type = $kind; text = $text })
        }
    }

    $article = [ordered]@{
        slug = $metadata.slug
        title = $metadata.title
        seoTitle = $metadata.seoTitle
        description = $metadata.description
        primaryKeyword = $metadata.keyword
        category = "Guides"
        canonicalUrl = "https://cloverloop.in/resources/$($metadata.slug)"
        indexable = $true
        image = "/images/resources/$($metadata.image).webp"
        imageAlt = $metadata.title
        related = $metadata.related
        blocks = $blocks
    }
    $destination = Join-Path $resourceDirectory "$($metadata.slug).json"
    $json = $article | ConvertTo-Json -Depth 8
    [System.IO.File]::WriteAllText($destination, $json, [System.Text.UTF8Encoding]::new($false))
    [void]$written.Add($metadata.slug)
}

if ($written.Count -ne $resourceMetadata.Count) {
    throw "Expected $($resourceMetadata.Count) unique article files, but imported $($written.Count). Check Word document heading text."
}

Write-Output "Imported $($written.Count) complete article bodies from the supplied Word document into content\resources."
