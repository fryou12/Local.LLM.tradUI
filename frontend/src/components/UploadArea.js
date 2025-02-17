import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useDropzone } from 'react-dropzone';
import { Box, Typography, CircularProgress } from '@mui/material';
const UploadArea = ({ onUpload, loading }) => {
    const { getRootProps, getInputProps } = useDropzone({
        accept: {
            'application/pdf': ['.pdf'],
            'text/plain': ['.txt']
        },
        multiple: false,
        onDrop: acceptedFiles => {
            if (acceptedFiles[0])
                onUpload(acceptedFiles[0]);
        }
    });
    return (_jsxs(Box, { ...getRootProps(), sx: {
            border: '2px dashed #ccc',
            borderRadius: 2,
            padding: 3,
            textAlign: 'center',
            cursor: 'pointer',
            backgroundColor: '#fafafa',
            '&:hover': {
                backgroundColor: '#f0f0f0'
            }
        }, children: [_jsx("input", { ...getInputProps() }), loading ? (_jsx(CircularProgress, {})) : (_jsx(Typography, { variant: "body1", children: "Glissez votre fichier PDF ou TXT ici, ou cliquez pour s\u00E9lectionner" }))] }));
};
export default UploadArea;
