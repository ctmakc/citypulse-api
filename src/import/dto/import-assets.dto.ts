import { IsEnum, IsString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Body shape for the JSON import path of POST /import/assets.
 *
 * The endpoint also accepts a multipart file upload (CSV or GeoJSON) via
 * FileInterceptor; in that case the body is ignored and the file buffer is
 * parsed instead. When no file is uploaded this DTO is used.
 */
export class ImportAssetsDto {
  @ApiProperty({
    enum: ['csv', 'geojson'],
    description: 'Format of the inline `content` payload.',
  })
  @IsEnum(['csv', 'geojson'] as any)
  format: 'csv' | 'geojson';

  @ApiProperty({
    description:
      'Raw asset data. For `csv`: a CSV string with header ' +
      'externalId,type,name,district,department,condition,failureProb,lat,lng. ' +
      'For `geojson`: a FeatureCollection of Point features whose `properties` ' +
      'carry the same fields.',
  })
  @IsString()
  content: string;
}
