// @ts-ignore
import PDFKit from 'pdfkit';
import fs from 'fs';
import path from 'path';
import * as pdfParse from 'pdf-parse';

interface DocumentStyle {
  fontSize?: number;
  fontFamily?: string;
  lineHeight?: number;
  pageSize?: string;
  margins?: {
    top: number;
    bottom: number;
    left: number;
    right: number;
  };
}

export class DocumentFormatter {
  private defaultStyle: DocumentStyle = {
    fontSize: 12,
    fontFamily: 'Helvetica',
    lineHeight: 1.5,
    pageSize: 'A4',
    margins: {
      top: 72,
      bottom: 72,
      left: 72,
      right: 72
    }
  };

  public async formatPDF(
    inputText: string,
    outputPath: string,
    style: DocumentStyle = {}
  ): Promise<void> {
    const mergedStyle = { ...this.defaultStyle, ...style };
    const doc = new PDFKit({ 
      size: mergedStyle.pageSize || 'A4',
      margin: mergedStyle.margins?.top || 72
    });

    const writeStream = fs.createWriteStream(outputPath);
    doc.pipe(writeStream);

    doc
      .font(mergedStyle.fontFamily || 'Helvetica')
      .fontSize(mergedStyle.fontSize || 12)
      .text(inputText, {
        lineGap: ((mergedStyle.lineHeight || 1.5) - 1) * (mergedStyle.fontSize || 12)
      });

    doc.end();

    return new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
  }

  public async analyzeOriginalStyle(filePath: string): Promise<DocumentStyle> {
    const fileExt = path.extname(filePath).toLowerCase();
    
    if (fileExt === '.pdf') {
      return this.analyzePDFStyle(filePath);
    }
    
    return this.defaultStyle;
  }

  private async analyzePDFStyle(filePath: string): Promise<DocumentStyle> {
    const dataBuffer = await fs.promises.readFile(filePath);
    const pdfData = await pdfParse.default(dataBuffer);
    
    return {
      fontSize: 12,
      fontFamily: 'Helvetica',
      lineHeight: 1.5,
      pageSize: 'A4',
      margins: {
        top: 72,
        bottom: 72,
        left: 72,
        right: 72
      }
    };
  }

  public async formatOutput(
    translatedText: string,
    outputPath: string,
    format: 'txt' | 'pdf' = 'pdf',
    style: DocumentStyle = {}
  ): Promise<string> {
    if (format === 'pdf') {
      await this.formatPDF(translatedText, outputPath, style);
    } else {
      await fs.promises.writeFile(outputPath, translatedText, 'utf8');
    }
    return outputPath;
  }
}
